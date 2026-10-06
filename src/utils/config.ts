/**
 * Runtime configuration from Expo public env vars.
 * Put values in `.env` at the project root (never commit secrets).
 */
import Constants from 'expo-constants';

const DEFAULT_STUN = 'stun:stun.l.google.com:19302';

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
  stunServers: parseList(process.env.EXPO_PUBLIC_STUN_SERVER, [DEFAULT_STUN]),
  turnServer: process.env.EXPO_PUBLIC_TURN_SERVER?.trim() || '',
  turnUsername: process.env.EXPO_PUBLIC_TURN_USERNAME?.trim() || '',
  turnPassword: process.env.EXPO_PUBLIC_TURN_PASSWORD?.trim() || '',
  isDev: __DEV__,
  maxViewers: 1,
  fixedCameraCount: 10,
  reconnectDelayMs: 2000,
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
