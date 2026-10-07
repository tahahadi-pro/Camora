/**
 * Runtime configuration from Expo public env vars.
 * Put values in `.env` at the project root (never commit secrets).
 */
import Constants from 'expo-constants';

const DEFAULT_STUN = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
];

/**
 * Free, shared TURN relay used as a safety net so streaming can still connect
 * across strict/mobile NATs when no dedicated TURN is configured. It is
 * rate-limited and not for heavy production use — set EXPO_PUBLIC_TURN_SERVER
 * (comma-separated URLs), EXPO_PUBLIC_TURN_USERNAME and EXPO_PUBLIC_TURN_PASSWORD
 * (see eas.json) to point at your own TURN server instead.
 */
const FALLBACK_TURN = {
  urls: [
    'turn:openrelay.metered.ca:80',
    'turn:openrelay.metered.ca:443',
    'turn:openrelay.metered.ca:443?transport=tcp',
  ],
  username: 'openrelayproject',
  credential: 'openrelayproject',
};

function isLocalHost(host: string): boolean {
  return (
    host === 'localhost' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/**
 * In development the laptop's LAN IP changes with every Wi-Fi/hotspot, so a
 * local signaling URL is re-pointed at the host Metro was loaded from.
 */
function resolveSignalingUrl(): string {
  const configured = process.env.EXPO_PUBLIC_SIGNALING_URL?.trim() || 'http://localhost:3001';
  if (!__DEV__) return configured;

  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!metroHost) return configured;

  const match = configured.match(/^(\w+:)\/\/([^:/]+)(?::(\d+))?/);
  if (!match || !isLocalHost(match[2])) return configured;
  return `${match[1]}//${metroHost}:${match[3] || '3001'}`;
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) return fallback;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  signalingUrl: resolveSignalingUrl(),
  stunServers: parseList(process.env.EXPO_PUBLIC_STUN_SERVER, DEFAULT_STUN),
  turnServers: parseList(process.env.EXPO_PUBLIC_TURN_SERVER, []),
  turnUsername: process.env.EXPO_PUBLIC_TURN_USERNAME?.trim() || '',
  turnPassword: process.env.EXPO_PUBLIC_TURN_PASSWORD?.trim() || '',
  isDev: __DEV__,
  maxViewers: 1,
  fixedCameraCount: 10,
  reconnectDelayMs: 2000,
};

export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = config.stunServers.map((urls) => ({ urls }));

  if (config.turnServers.length > 0) {
    servers.push({
      urls: config.turnServers,
      username: config.turnUsername || undefined,
      credential: config.turnPassword || undefined,
    });
  } else {
    // No dedicated TURN configured: fall back to the shared relay so media can
    // still be relayed when a direct peer-to-peer path is not possible.
    servers.push({
      urls: FALLBACK_TURN.urls,
      username: FALLBACK_TURN.username,
      credential: FALLBACK_TURN.credential,
    });
  }

  return servers;
}

export type RTCIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};
