# Camora signaling server

Node.js + Express + Socket.IO signaling for WebRTC.

```bash
npm install
cp .env.example .env
npm start
```

Events: `create-room`, `join-room`, `offer`, `answer`, `ice-candidate`, `camera-disconnected`, `viewer-connected`, `viewer-disconnected`.

Put HTTPS/WSS in front for production (Caddy/nginx/Render/Railway).
