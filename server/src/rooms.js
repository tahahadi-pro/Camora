import crypto from 'crypto';

export const FIXED_CAMERA_COUNT = Number(process.env.FIXED_CAMERA_SLOTS || 10);

/**
 * Normalize join/create codes.
 * Fixed cameras use "1"…"10"; legacy random codes stay uppercase.
 */
export function normalizeRoomCode(code) {
  const raw = String(code ?? '').trim();
  if (/^(?:[1-9]|10)$/.test(raw)) return raw;
  return raw.toUpperCase();
}

export function parseCameraSlot(value) {
  const n = Number(String(value ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > FIXED_CAMERA_COUNT) return null;
  return n;
}

function isFixedSlot(code) {
  return parseCameraSlot(code) != null;
}

/**
 * In-memory room store with fixed camera slots 1…N.
 * Each phone claims a slot; viewer enters that number to watch (one viewer at a time).
 */
export class RoomManager {
  constructor({ ttlMs = 4 * 60 * 60 * 1000, maxViewers = 1 } = {}) {
    this.rooms = new Map();
    this.ttlMs = ttlMs;
    this.maxViewers = maxViewers;
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60_000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  createRoom(cameraSocketId, { cameraId } = {}) {
    const slot = parseCameraSlot(cameraId);
    if (slot == null) {
      const error = new Error('INVALID_CAMERA_ID');
      error.code = 'INVALID_CAMERA_ID';
      throw error;
    }

    const code = String(slot);
    const existing = this.rooms.get(code);

    if (existing?.cameraSocketId && existing.cameraSocketId !== cameraSocketId) {
      const error = new Error('CAMERA_TAKEN');
      error.code = 'CAMERA_TAKEN';
      throw error;
    }

    const sessionToken = crypto.randomBytes(24).toString('hex');
    const room = {
      code,
      cameraId: code,
      sessionToken,
      cameraSocketId,
      viewerSocketId: existing?.viewerSocketId && existing.viewerSocketId !== cameraSocketId
        ? null
        : null,
      createdAt: existing?.createdAt ?? Date.now(),
      expiresAt: Date.now() + this.ttlMs,
      status: 'waiting',
      fixed: true,
    };

    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    if (!code) return null;
    const key = normalizeRoomCode(code);
    const room = this.rooms.get(key);
    if (!room) return null;
    if (Date.now() > room.expiresAt) {
      // Keep empty fixed slots reclaimable without hard delete noise
      if (room.fixed && !room.cameraSocketId) {
        this.rooms.delete(key);
        return null;
      }
      if (!room.cameraSocketId) {
        this.deleteRoom(room.code);
        return null;
      }
      // Live fixed camera: extend while streaming
      room.expiresAt = Date.now() + this.ttlMs;
    }
    return room;
  }

  getRoomBySocketId(socketId) {
    for (const room of this.rooms.values()) {
      if (room.cameraSocketId === socketId || room.viewerSocketId === socketId) {
        return room;
      }
    }
    return null;
  }

  joinRoom(code, viewerSocketId) {
    const room = this.getRoom(code);
    if (!room) {
      return { ok: false, error: 'ROOM_NOT_FOUND' };
    }
    if (Date.now() > room.expiresAt) {
      this.deleteRoom(room.code);
      return { ok: false, error: 'ROOM_EXPIRED' };
    }
    if (!room.cameraSocketId) {
      return { ok: false, error: 'CAMERA_OFFLINE' };
    }
    if (room.viewerSocketId && room.viewerSocketId !== viewerSocketId) {
      return { ok: false, error: 'ROOM_FULL' };
    }

    room.viewerSocketId = viewerSocketId;
    room.status = 'live';
    room.expiresAt = Date.now() + this.ttlMs;
    return { ok: true, room };
  }

  removeViewer(room) {
    if (!room) return;
    room.viewerSocketId = null;
    room.status = room.cameraSocketId ? 'waiting' : 'inactive';
  }

  removeCamera(room) {
    if (!room) return;
    room.cameraSocketId = null;
    room.status = 'inactive';
  }

  deleteRoom(code) {
    this.rooms.delete(normalizeRoomCode(code));
  }

  handleDisconnect(socketId) {
    const room = this.getRoomBySocketId(socketId);
    if (!room) return null;

    const role =
      room.cameraSocketId === socketId
        ? 'camera'
        : room.viewerSocketId === socketId
          ? 'viewer'
          : null;

    if (role === 'camera') {
      const leftoverViewer = room.viewerSocketId;
      this.removeCamera(room);
      this.removeViewer(room);
      // Fixed slots stay reserved by number so phones can reclaim 1–10
      if (!room.fixed) {
        this.deleteRoom(room.code);
      }
      return {
        role,
        roomCode: room.code,
        notifySocketId: leftoverViewer,
        event: 'camera-disconnected',
      };
    }

    if (role === 'viewer') {
      this.removeViewer(room);
      return {
        role,
        roomCode: room.code,
        notifySocketId: room.cameraSocketId,
        event: 'viewer-disconnected',
      };
    }

    return null;
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (now > room.expiresAt) {
        if (room.cameraSocketId) {
          room.expiresAt = now + this.ttlMs;
          continue;
        }
        this.rooms.delete(code);
      } else if (room.status === 'inactive' && !room.cameraSocketId && !isFixedSlot(code)) {
        this.rooms.delete(code);
      }
    }
  }

  stats() {
    return {
      activeRooms: this.rooms.size,
      fixedCameraSlots: FIXED_CAMERA_COUNT,
      rooms: [...this.rooms.values()].map((r) => ({
        code: r.code,
        status: r.status,
        hasCamera: Boolean(r.cameraSocketId),
        hasViewer: Boolean(r.viewerSocketId),
        expiresAt: r.expiresAt,
      })),
    };
  }

  destroy() {
    clearInterval(this.cleanupTimer);
    this.rooms.clear();
  }
}
