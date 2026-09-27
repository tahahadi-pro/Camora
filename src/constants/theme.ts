/**
 * Camora CCTV theme — dark security interface.
 */
export const Colors = {
  background: '#0B0F14',
  surface: '#121821',
  surfaceElevated: '#1A2330',
  border: '#243041',
  text: '#E8EEF6',
  textMuted: '#8B9BB0',
  primary: '#2DD4BF',
  live: '#22C55E',
  recording: '#EF4444',
  connecting: '#EAB308',
  disconnected: '#6B7280',
  danger: '#F87171',
  warning: '#FBBF24',
  button: '#1E293B',
  buttonActive: '#334155',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const ERROR_MESSAGES = {
  CAMERA_PERMISSION_DENIED:
    'Camera permission denied. Enable camera access in system settings to stream.',
  MICROPHONE_PERMISSION_DENIED:
    'Microphone permission denied. Streaming can continue without audio.',
  INVALID_CAMERA_CODE: 'Enter a camera number from 1 to 10.',
  INVALID_CAMERA_ID: 'Pick a camera number from 1 to 10.',
  CAMERA_TAKEN: 'That camera number is already in use on another phone.',
  ROOM_EXPIRED: 'This room has expired. Ask the camera phone to start a new session.',
  ROOM_NOT_FOUND: 'No active camera found for that number. Start the camera phone first.',
  ROOM_FULL: 'A viewer is already connected. Disconnect them first, or wait.',
  CAMERA_OFFLINE: 'Camera is offline or not streaming.',
  VIEWER_DISCONNECTED: 'Viewer disconnected.',
  INTERNET_UNAVAILABLE: 'Internet connection lost. Reconnecting…',
  WEBRTC_FAILED: 'WebRTC connection failed. Check network and TURN configuration.',
  TURN_FAILED: 'Direct peer connection blocked. Configure a TURN server for mobile networks.',
  SIGNALING_UNAVAILABLE:
    'Signaling server unavailable. Check EXPO_PUBLIC_SIGNALING_URL and that the server is running.',
  INVALID_SESSION: 'Session token mismatch. Scan the QR code again or re-enter the code.',
  CONNECTION_LOST: 'Camera connection lost',
};

export const APP_SCHEME = 'camora';
