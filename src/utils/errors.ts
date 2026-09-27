import { ERROR_MESSAGES } from '@/constants/theme';

export function mapServerError(code?: string): string {
  switch (code) {
    case 'ROOM_NOT_FOUND':
      return ERROR_MESSAGES.ROOM_NOT_FOUND;
    case 'ROOM_EXPIRED':
      return ERROR_MESSAGES.ROOM_EXPIRED;
    case 'ROOM_FULL':
      return ERROR_MESSAGES.ROOM_FULL;
    case 'CAMERA_OFFLINE':
      return ERROR_MESSAGES.CAMERA_OFFLINE;
    case 'CAMERA_TAKEN':
      return ERROR_MESSAGES.CAMERA_TAKEN;
    case 'INVALID_CAMERA_ID':
      return ERROR_MESSAGES.INVALID_CAMERA_ID;
    case 'INVALID_SESSION':
      return ERROR_MESSAGES.INVALID_SESSION;
    case 'INVALID_CAMERA_CODE':
      return ERROR_MESSAGES.INVALID_CAMERA_CODE;
    default:
      return code || 'Something went wrong.';
  }
}

export function formatLatency(ms: number | null): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  return `${Math.round(ms)} ms`;
}
