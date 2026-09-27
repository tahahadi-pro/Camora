export type ConnectionPayload = {
  v: 1;
  roomCode: string;
  sessionToken: string;
  signalingUrl: string;
  cameraId?: string;
};

export function encodeConnectionPayload(payload: ConnectionPayload): string {
  return JSON.stringify(payload);
}

export function parseConnectionPayload(raw: string): ConnectionPayload | null {
  const text = raw.trim();
  if (!text) return null;

  // Fixed camera number 1–10, or legacy alphanumeric room code
  if (/^(?:[1-9]|10)$/.test(text)) {
    return {
      v: 1,
      roomCode: text,
      sessionToken: '',
      signalingUrl: '',
    };
  }
  if (/^[A-Z0-9]{4,10}$/i.test(text)) {
    return {
      v: 1,
      roomCode: text.toUpperCase(),
      sessionToken: '',
      signalingUrl: '',
    };
  }

  // Deep link: camora://join?code=ABC123&token=...
  if (text.startsWith('camora://') || text.includes('://')) {
    try {
      const url = new URL(text);
      const rawCode = (url.searchParams.get('code') || url.searchParams.get('room') || '').trim();
      const roomCode = /^(?:[1-9]|10)$/.test(rawCode) ? rawCode : rawCode.toUpperCase();
      if (!roomCode) return null;
      return {
        v: 1,
        roomCode,
        sessionToken: url.searchParams.get('token') || '',
        signalingUrl: url.searchParams.get('s') || '',
        cameraId: url.searchParams.get('id') || undefined,
      };
    } catch {
      return null;
    }
  }

  try {
    const data = JSON.parse(text) as ConnectionPayload;
    if (!data?.roomCode) return null;
    const rawCode = String(data.roomCode).trim();
    return {
      v: 1,
      roomCode: /^(?:[1-9]|10)$/.test(rawCode) ? rawCode : rawCode.toUpperCase(),
      sessionToken: data.sessionToken || '',
      signalingUrl: data.signalingUrl || '',
      cameraId: data.cameraId,
    };
  } catch {
    return null;
  }
}

export function toDeepLink(payload: ConnectionPayload): string {
  const params = new URLSearchParams({
    code: payload.roomCode,
    token: payload.sessionToken,
  });
  if (payload.signalingUrl) params.set('s', payload.signalingUrl);
  if (payload.cameraId) params.set('id', payload.cameraId);
  return `camora://join?${params.toString()}`;
}
