# Camora

Live CCTV-style video streaming between two Android phones using **React Native (Expo)** + **WebRTC** + a **Node.js / Socket.IO** signaling server.

No login, email, password, or accounts. Phone 1 starts a temporary room and shares a short code (or QR). Phone 2 joins and watches the live stream over the internet (not LAN-only).

> **Expo Go is not supported.** `react-native-webrtc` needs custom native code. Use an **Expo development build** / **EAS Build**.

## Architecture

```
Phone 1 (Camera)
  → WebRTC publisher
  → Internet
  → Signaling server (Socket.IO) + STUN/TURN
  → Internet
  → Phone 2 (Viewer) WebRTC subscriber
```

- Direct peer-to-peer when NAT allows it
- **TURN relay** when mobile networks block direct ICE (required for reliable cross-network streaming)

## Project layout

```
src/
  app/                 Expo Router screens
  screens/             Home, Camera, Viewer, QR scanner
  components/
  services/
    webrtc/            Peer connection helpers
    signaling/         Socket.IO client
  hooks/
  utils/
  constants/
server/
  src/
    server.js
    signaling.js
    rooms.js
```

## 1. Install

```bash
npm install
npm run server:install
```

Copy env files:

```bash
copy .env.example .env
copy server\.env.example server\.env
```

## 2. Where to put SIGNALING / STUN / TURN settings

### Mobile app (project root `.env`)

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SIGNALING_URL` | Signaling server URL (`http://LAN_IP:3001` for local devices, `https://…` in production) |
| `EXPO_PUBLIC_STUN_SERVER` | STUN URL(s), comma-separated. Default: `stun:stun.l.google.com:19302` |
| `EXPO_PUBLIC_TURN_SERVER` | TURN URL, e.g. `turn:your-turn-host:3478` |
| `EXPO_PUBLIC_TURN_USERNAME` | TURN username |
| `EXPO_PUBLIC_TURN_PASSWORD` | TURN password |

Never hardcode TURN credentials in source. Restart Expo after changing `.env`.

### Signaling server (`server/.env`)

| Variable | Purpose |
|---|---|
| `PORT` | Default `3001` |
| `ROOM_TTL_MS` | Room expiry (default 4 hours) |
| `MAX_VIEWERS` | Default `1` |
| `CORS_ORIGIN` | `*` for dev, or your app origins |

## 3. Start the signaling server

```bash
npm run server
```

Health check: `http://localhost:3001/health`

**Physical phones:** use your PC’s LAN IP in the app `.env`, e.g. `EXPO_PUBLIC_SIGNALING_URL=http://192.168.1.20:3001` (phones and PC must reach that host; for cross-network / cellular use a public HTTPS / WSS deploy).

## 4. Development build (required for WebRTC)

### Option A — Local Android build

Needs Android Studio / SDK:

```bash
npx expo install expo-dev-client
npx expo run:android
```

Then:

```bash
npm start
```

### Option B — EAS cloud development APK

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile development
```

Install the APK on both phones, then:

```bash
npm start
```

Open the Camora development client and connect to the Metro bundler.

## 5. Production Android builds (EAS)

### APK (internal / sideload)

```bash
eas build --platform android --profile preview
```

### AAB (Play Store)

```bash
eas build --platform android --profile production
```

Set production env in `eas.json` or EAS secrets:

- `EXPO_PUBLIC_SIGNALING_URL=https://your-signaling.example.com`
- `EXPO_PUBLIC_STUN_SERVER=stun:…`
- `EXPO_PUBLIC_TURN_SERVER=turn:…`
- `EXPO_PUBLIC_TURN_USERNAME=…`
- `EXPO_PUBLIC_TURN_PASSWORD=…`

Use **HTTPS + WSS** in production (reverse proxy nginx/Caddy in front of the Node server).

## 6. Deploy signaling (Render / Railway / VPS)

1. Deploy the `server/` folder as a Node web service
2. Expose port `PORT` (or let the host inject it)
3. Put TLS in front so clients use `https://` / `wss://`
4. Point `EXPO_PUBLIC_SIGNALING_URL` at that URL and rebuild the app

### TURN (coturn) — strongly recommended

On a VPS, install [coturn](https://github.com/coturn/coturn), open UDP/TCP 3478 (and relay ports), set username/password, then put those values in the app `.env`. Without TURN, many mobile-network pairs will fail ICE.

## App flow

### Phone 1 — Camera

1. Open Camora → **Start Camera**
2. Allow camera (and optionally microphone)
3. Tap **Start** → room code + QR appear
4. Keep the session running (notification: “CCTV Camera is streaming”)

### Phone 2 — Viewer

1. Open Camora → **View Camera**
2. Enter the **VIEW CODE** or **Scan QR Code**
3. Tap **CONNECT** → live video

## Features

- WebRTC live video (rear camera default, front/rear switch)
- Optional microphone / viewer audio mute
- Temporary high-entropy room codes + session tokens
- Max 1 viewer per room
- Room expiry + camera disconnect detection
- QR join + manual code
- Network status + auto signaling reconnect
- Dev debug panel (ICE / peer / signaling / network) only in `__DEV__`
- Dark CCTV UI

## Security notes

- No public stream directory — codes are random and short-lived
- Session tokens travel in QR / deep link payloads
- Max viewers = 1
- Do not expose TURN long-lived credentials in public repos; prefer temporary credentials in production

## Background / Android

While streaming, Camora:

- Keeps the screen awake (`expo-keep-awake`)
- Shows a persistent notification: **CCTV Camera is streaming**
- Declares `FOREGROUND_SERVICE*` permissions for development builds

True camera capture while the app is fully backgrounded is OS-restricted; always start streaming explicitly from the Camera screen.

## Scripts

```bash
npm install
npm run server:install
npm run server          # signaling
npm start               # Expo dev client bundler
npm run typecheck
npm run lint
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Signaling unavailable | Server running? Correct `EXPO_PUBLIC_SIGNALING_URL`? Firewall? |
| Connects on Wi-Fi, fails on mobile data | Configure TURN |
| Invalid / expired code | Camera must be streaming; codes expire |
| Expo Go crash / missing native module | Use a development build |
| Room full | Only 1 viewer allowed — disconnect the other viewer |

## License

See `LICENSE`.
