/**
 * Socket.IO WebRTC signaling handlers.
 * Relays SDP offers/answers and ICE candidates between camera and viewer.
 */
export function attachSignaling(io, roomManager) {
  io.on('connection', (socket) => {
    socket.data.role = null;
    socket.data.roomCode = null;
    console.log(`[camora] socket connected ${socket.id} from ${socket.handshake.address}`);

    socket.on('create-room', (payload, ack) => {
      let data = payload;
      let callback = ack;
      if (typeof payload === 'function') {
        callback = payload;
        data = {};
      }

      try {
        const existing = roomManager.getRoomBySocketId(socket.id);
        if (existing && existing.cameraSocketId === socket.id) {
          socket.join(existing.code);
          socket.data.role = 'camera';
          socket.data.roomCode = existing.code;
          if (typeof callback === 'function') {
            callback({
              ok: true,
              roomCode: existing.code,
              cameraId: existing.cameraId,
              sessionToken: existing.sessionToken,
              maxViewers: roomManager.maxViewers,
            });
          }
          return;
        }

        // A camera that reconnected gets a new socket id; free the slot if the old socket is gone.
        const previous = roomManager.getRoom(data?.cameraId);
        if (previous?.cameraSocketId && !io.sockets.sockets.has(previous.cameraSocketId)) {
          roomManager.removeCamera(previous);
          roomManager.removeViewer(previous);
        }

        const room = roomManager.createRoom(socket.id, {
          cameraId: data?.cameraId,
        });
        socket.join(room.code);
        socket.data.role = 'camera';
        socket.data.roomCode = room.code;
        console.log(`[camora] camera ${room.code} online (${socket.id})`);

        if (typeof callback === 'function') {
          callback({
            ok: true,
            roomCode: room.code,
            cameraId: room.cameraId,
            sessionToken: room.sessionToken,
            maxViewers: roomManager.maxViewers,
          });
        }

        socket.emit('camera-connected', {
          roomCode: room.code,
          cameraId: room.cameraId,
        });
      } catch (error) {
        console.log(`[camora] create-room ${data?.cameraId} failed: ${error.code || error.message}`);
        if (typeof callback === 'function') {
          callback({
            ok: false,
            error: error.code || 'CREATE_FAILED',
            message: error.message,
          });
        }
      }
    });

    socket.on('join-room', ({ roomCode, sessionToken } = {}, ack) => {
      try {
        const result = roomManager.joinRoom(roomCode, socket.id);
        console.log(`[camora] viewer join ${roomCode}: ${result.ok ? 'ok' : result.error}`);
        if (!result.ok) {
          if (typeof ack === 'function') ack(result);
          return;
        }

        const room = result.room;

        // Optional session token check if the camera shared one via QR payload
        if (sessionToken && sessionToken !== room.sessionToken) {
          roomManager.removeViewer(room);
          if (typeof ack === 'function') {
            ack({ ok: false, error: 'INVALID_SESSION' });
          }
          return;
        }

        socket.join(room.code);
        socket.data.role = 'viewer';
        socket.data.roomCode = room.code;

        if (typeof ack === 'function') {
          ack({
            ok: true,
            roomCode: room.code,
            cameraId: room.cameraId,
            sessionToken: room.sessionToken,
          });
        }

        socket.to(room.cameraSocketId).emit('viewer-connected', {
          roomCode: room.code,
          viewerSocketId: socket.id,
        });

        socket.emit('camera-connected', {
          roomCode: room.code,
          cameraId: room.cameraId,
        });
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'JOIN_FAILED', message: error.message });
        }
      }
    });

    socket.on('offer', ({ roomCode, sdp }) => {
      const room = roomManager.getRoom(roomCode || socket.data.roomCode);
      if (!room || room.cameraSocketId !== socket.id || !room.viewerSocketId) return;
      socket.to(room.viewerSocketId).emit('offer', {
        sdp,
        roomCode: room.code,
        from: socket.id,
      });
    });

    socket.on('answer', ({ roomCode, sdp }) => {
      const room = roomManager.getRoom(roomCode || socket.data.roomCode);
      if (!room || room.viewerSocketId !== socket.id || !room.cameraSocketId) return;
      socket.to(room.cameraSocketId).emit('answer', {
        sdp,
        roomCode: room.code,
        from: socket.id,
      });
    });

    socket.on('ice-candidate', ({ roomCode, candidate }) => {
      const room = roomManager.getRoom(roomCode || socket.data.roomCode);
      if (!room || !candidate) return;

      let target = null;
      if (socket.id === room.cameraSocketId) target = room.viewerSocketId;
      if (socket.id === room.viewerSocketId) target = room.cameraSocketId;
      if (!target) return;

      socket.to(target).emit('ice-candidate', {
        candidate,
        roomCode: room.code,
        from: socket.id,
      });
    });

    socket.on('leave-room', (ack) => {
      const result = roomManager.handleDisconnect(socket.id);
      if (result) console.log(`[camora] ${result.role} left ${result.roomCode}`);
      if (result?.notifySocketId) {
        io.to(result.notifySocketId).emit(result.event, {
          roomCode: result.roomCode,
        });
      }
      if (socket.data.roomCode) socket.leave(socket.data.roomCode);
      socket.data.role = null;
      socket.data.roomCode = null;
      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('ping-latency', (sentAt, ack) => {
      if (typeof ack === 'function') {
        ack({ sentAt, serverTime: Date.now() });
      }
    });

    socket.on('disconnect', (reason) => {
      const result = roomManager.handleDisconnect(socket.id);
      console.log(
        `[camora] socket disconnected ${socket.id} (${reason})` +
          (result ? ` — ${result.role} of ${result.roomCode}` : ''),
      );
      if (result?.notifySocketId) {
        io.to(result.notifySocketId).emit(result.event, {
          roomCode: result.roomCode,
        });
      }
    });
  });
}
