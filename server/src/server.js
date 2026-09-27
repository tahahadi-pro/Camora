import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { FIXED_CAMERA_COUNT, RoomManager } from './rooms.js';
import { attachSignaling } from './signaling.js';

const PORT = Number(process.env.PORT || 3001);
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS || 4 * 60 * 60 * 1000);
const MAX_VIEWERS = Number(process.env.MAX_VIEWERS || 1);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
const server = http.createServer(app);

const corsOptions =
  CORS_ORIGIN === '*'
    ? { origin: true, credentials: true }
    : {
        origin: CORS_ORIGIN.split(',').map((s) => s.trim()),
        credentials: true,
      };

app.use(cors(corsOptions));
app.use(express.json());

const roomManager = new RoomManager({
  ttlMs: ROOM_TTL_MS,
  maxViewers: MAX_VIEWERS,
});

const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 20000,
});

attachSignaling(io, roomManager);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'camora-signaling',
    uptime: process.uptime(),
    rooms: roomManager.stats().activeRooms,
  });
});

app.post('/api/rooms/create', (_req, res) => {
  // HTTP helper for diagnostics — actual rooms are created over Socket.IO
  res.status(501).json({
    ok: false,
    error: 'USE_SOCKET',
    message: 'Create rooms via Socket.IO event create-room for WebRTC signaling.',
  });
});

app.post('/api/rooms/join', (req, res) => {
  const { roomCode } = req.body || {};
  const room = roomManager.getRoom(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  }
  if (Date.now() > room.expiresAt) {
    roomManager.deleteRoom(room.code);
    return res.status(410).json({ ok: false, error: 'ROOM_EXPIRED' });
  }
  if (!room.cameraSocketId) {
    return res.status(409).json({ ok: false, error: 'CAMERA_OFFLINE' });
  }
  if (room.viewerSocketId) {
    return res.status(409).json({ ok: false, error: 'ROOM_FULL' });
  }
  return res.json({
    ok: true,
    roomCode: room.code,
    cameraId: room.cameraId,
    status: room.status,
  });
});

app.delete('/api/rooms/:roomId', (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret && req.headers['x-admin-secret'] !== adminSecret) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  const room = roomManager.getRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  }
  if (room.cameraSocketId) {
    io.to(room.cameraSocketId).emit('room-closed', { roomCode: room.code });
  }
  if (room.viewerSocketId) {
    io.to(room.viewerSocketId).emit('camera-disconnected', { roomCode: room.code });
  }
  roomManager.deleteRoom(room.code);
  return res.json({ ok: true });
});

app.get('/api/stats', (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret && req.headers['x-admin-secret'] !== adminSecret) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  res.json(roomManager.stats());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[camora] Signaling server listening on :${PORT}`);
  console.log(
    `[camora] ROOM_TTL_MS=${ROOM_TTL_MS} MAX_VIEWERS=${MAX_VIEWERS} FIXED_CAMERA_SLOTS=${FIXED_CAMERA_COUNT}`,
  );
  console.log(`[camora] Use WSS/HTTPS in production behind a reverse proxy.`);
});

function shutdown() {
  console.log('[camora] Shutting down...');
  roomManager.destroy();
  io.close();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
