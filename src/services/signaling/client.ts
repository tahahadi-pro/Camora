import { io, Socket } from 'socket.io-client';
import { config } from '@/utils/config';

export type SignalingAck<T = Record<string, unknown>> = T & {
  ok: boolean;
  error?: string;
  message?: string;
};

export type CreateRoomResult = SignalingAck<{
  roomCode: string;
  cameraId: string;
  sessionToken: string;
  maxViewers: number;
}>;

export type JoinRoomResult = SignalingAck<{
  roomCode: string;
  cameraId: string;
  sessionToken: string;
}>;

type SignalingEvents = {
  offer: (payload: { sdp: unknown; roomCode: string; from: string }) => void;
  answer: (payload: { sdp: unknown; roomCode: string; from: string }) => void;
  'ice-candidate': (payload: {
    candidate: unknown;
    roomCode: string;
    from: string;
  }) => void;
  'viewer-connected': (payload: { roomCode: string; viewerSocketId: string }) => void;
  'viewer-disconnected': (payload: { roomCode: string }) => void;
  'camera-connected': (payload: { roomCode: string; cameraId: string }) => void;
  'camera-disconnected': (payload: { roomCode: string }) => void;
  'room-closed': (payload: { roomCode: string }) => void;
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
};

export class SignalingClient {
  private socket: Socket | null = null;
  private url: string = config.signalingUrl;

  connect(url = config.signalingUrl): Socket {
    if (this.socket?.connected && this.url === url) {
      return this.socket;
    }

    this.disconnect();
    this.url = url;

    this.socket = io(url, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: config.reconnectDelayMs,
      reconnectionDelayMax: 5000,
      timeout: 12000,
    });

    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  on<E extends keyof SignalingEvents>(event: E, handler: SignalingEvents[E]) {
    this.socket?.on(event as string, handler as (...args: unknown[]) => void);
  }

  off<E extends keyof SignalingEvents>(event: E, handler?: SignalingEvents[E]) {
    if (handler) {
      this.socket?.off(event as string, handler as (...args: unknown[]) => void);
    } else {
      this.socket?.off(event as string);
    }
  }

  /** `cameraKey` lets the same phone take its number back from its own dead socket. */
  createRoom(cameraId: number | string, cameraKey?: string): Promise<CreateRoomResult> {
    return this.emitAck('create-room', { cameraId: String(cameraId), cameraKey });
  }

  joinRoom(roomCode: string, sessionToken?: string): Promise<JoinRoomResult> {
    return this.emitAck('join-room', { roomCode, sessionToken });
  }

  sendOffer(roomCode: string, sdp: unknown) {
    this.socket?.emit('offer', { roomCode, sdp });
  }

  sendAnswer(roomCode: string, sdp: unknown) {
    this.socket?.emit('answer', { roomCode, sdp });
  }

  sendIceCandidate(roomCode: string, candidate: unknown) {
    this.socket?.emit('ice-candidate', { roomCode, candidate });
  }

  leaveRoom(): Promise<SignalingAck> {
    return this.emitAck('leave-room');
  }

  measureLatency(): Promise<number | null> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve(null);
        return;
      }
      const sentAt = Date.now();
      this.socket.timeout(4000).emit('ping-latency', sentAt, (_err: Error | null) => {
        resolve(Date.now() - sentAt);
      });
    });
  }

  /** Calls `onAck` when the server answers. Uses no JS timer, so it works in the background. */
  ping(onAck: () => void) {
    this.socket?.emit('ping-latency', Date.now(), () => onAck());
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private emitAck<T>(event: string, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('SIGNALING_UNAVAILABLE'));
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error('SIGNALING_TIMEOUT'));
      }, 12000);

      const cb = (result: T) => {
        clearTimeout(timer);
        resolve(result);
      };

      if (payload === undefined) {
        this.socket.emit(event, cb);
      } else {
        this.socket.emit(event, payload, cb);
      }
    });
  }
}

export const signaling = new SignalingClient();
