/**
 * Runtime configuration from Expo public env vars.
 * Put values in `.env` at the project root (never commit secrets).
 */
const DEFAULT_STUN = 'stun:stun.l.google.com:19302';

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) return fallback;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  signalingUrl:
    process.env.EXPO_PUBLIC_SIGNALING_URL?.trim() || 'http://localhost:3001',
  stunServers: parseList(process.env.EXPO_PUBLIC_STUN_SERVER, [DEFAULT_STUN]),
  turnServer: process.env.EXPO_PUBLIC_TURN_SERVER?.trim() || '',
  turnUsername: process.env.EXPO_PUBLIC_TURN_USERNAME?.trim() || '',
  turnPassword: process.env.EXPO_PUBLIC_TURN_PASSWORD?.trim() || '',
  isDev: __DEV__,
  maxViewers: 1,
  fixedCameraCount: 10,
  reconnectDelayMs: 2000,
  reconnectMaxAttempts: 12,
};

export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = config.stunServers.map((urls) => ({ urls }));

  if (config.turnServer) {
    servers.push({
      urls: config.turnServer,
      username: config.turnUsername || undefined,
      credential: config.turnPassword || undefined,
    });
  }

  return servers;
}

export type RTCIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};
