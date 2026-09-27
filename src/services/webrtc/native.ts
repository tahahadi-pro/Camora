/**
 * Safe WebRTC native bridge.
 * Expo Go does not include react-native-webrtc — a development build is required.
 */

export type WebRtcNative = typeof import('react-native-webrtc');

let cached: WebRtcNative | null | undefined;
let loadError: Error | null = null;

export function getWebRtcLoadError(): Error | null {
  return loadError;
}

export function isWebRtcAvailable(): boolean {
  return getWebRtcNative() != null;
}

export function getWebRtcNative(): WebRtcNative | null {
  if (cached !== undefined) return cached;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-webrtc') as WebRtcNative;
    if (typeof mod.registerGlobals === 'function') {
      mod.registerGlobals();
    }
    cached = mod;
    loadError = null;
    return cached;
  } catch (error) {
    cached = null;
    loadError =
      error instanceof Error
        ? error
        : new Error('WebRTC native module not found. Use an Expo development build.');
    return null;
  }
}

export function requireWebRtc(): WebRtcNative {
  const mod = getWebRtcNative();
  if (!mod) {
    throw loadError ?? new Error('WebRTC is unavailable. Build a development client.');
  }
  return mod;
}
