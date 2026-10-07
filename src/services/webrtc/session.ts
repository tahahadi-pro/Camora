import { getIceServers } from '@/utils/config';
import { requireWebRtc } from '@/services/webrtc/native';

export type WebRtcDebugState = {
  iceConnectionState: string;
  connectionState: string;
  signalingState: string;
  iceGatheringState: string;
};

export type PeerRole = 'camera' | 'viewer';

type MediaStream = import('react-native-webrtc').MediaStream;
type RTCIceCandidate = import('react-native-webrtc').RTCIceCandidate;
type RTCPeerConnection = import('react-native-webrtc').RTCPeerConnection;
type MediaStreamTrack = import('react-native-webrtc').MediaStreamTrack;
type RTCDataChannel = import('react-native-webrtc/lib/typescript/RTCDataChannel').default;

/** Commands the viewer sends to the camera phone over the WebRTC data channel. */
export type ControlMessage = { type: 'switch-camera' };
type RTCSessionDescriptionInit = ConstructorParameters<
  typeof import('react-native-webrtc').RTCSessionDescription
>[0];
type RTCIceCandidateInit = ConstructorParameters<
  typeof import('react-native-webrtc').RTCIceCandidate
>[0];

type PeerCallbacks = {
  onLocalStream?: (stream: MediaStream | null) => void;
  onRemoteStream?: (stream: MediaStream | null) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange?: (state: string) => void;
  onIceConnectionStateChange?: (state: string) => void;
  onDebug?: (debug: WebRtcDebugState) => void;
  onError?: (message: string) => void;
  onControlMessage?: (message: ControlMessage) => void;
  onControlChannelChange?: (open: boolean) => void;
  /** Fired when the connection drops and the offerer should renegotiate (ICE restart). */
  onRestartNeeded?: () => void;
};

/**
 * WebRTC peer helper for Camora camera/viewer sessions.
 */
export class WebRtcSession {
  private pc: RTCPeerConnection | null = null;
  private controlChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private role: PeerRole;
  private facingMode: 'environment' | 'user' = 'environment';
  private micEnabled = false;
  private remoteAudioEnabled = true;
  private callbacks: PeerCallbacks;
  private makingOffer = false;
  private webrtc = requireWebRtc();
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(role: PeerRole, callbacks: PeerCallbacks = {}) {
    this.role = role;
    this.callbacks = callbacks;
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }

  getPeerConnection() {
    return this.pc;
  }

  getDebugState(): WebRtcDebugState {
    return {
      iceConnectionState: this.pc?.iceConnectionState ?? 'new',
      connectionState: this.pc?.connectionState ?? 'new',
      signalingState: this.pc?.signalingState ?? 'stable',
      iceGatheringState: this.pc?.iceGatheringState ?? 'new',
    };
  }

  async startCamera(options?: {
    facingMode?: 'environment' | 'user';
    audio?: boolean;
  }) {
    this.facingMode = options?.facingMode ?? 'environment';
    this.micEnabled = Boolean(options?.audio);

    const stream = await this.webrtc.mediaDevices.getUserMedia({
      audio: this.micEnabled,
      video: {
        facingMode: this.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
    });

    this.localStream = stream as MediaStream;
    // Android can hand back audio tracks flagged as disabled, which sends silence.
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = this.micEnabled;
    });
    this.callbacks.onLocalStream?.(this.localStream);
    return this.localStream;
  }

  /** Returns true when a new audio track was added to a live peer connection. */
  async setMicrophoneEnabled(enabled: boolean): Promise<boolean> {
    this.micEnabled = enabled;

    if (!this.localStream) return false;

    const audioTracks = this.localStream.getAudioTracks();
    if (enabled && audioTracks.length === 0) {
      const audioOnly = (await this.webrtc.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      })) as MediaStream;
      let added = false;
      audioOnly.getAudioTracks().forEach((track) => {
        track.enabled = true;
        this.localStream?.addTrack(track);
        if (this.pc) {
          this.pc.addTrack(track, this.localStream!);
          added = true;
        }
      });
      return added;
    }

    audioTracks.forEach((track) => {
      track.enabled = enabled;
    });
    return false;
  }

  async switchCamera() {
    if (!this.localStream) return;
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';

    const videoTrack = this.localStream.getVideoTracks()[0] as MediaStreamTrack & {
      _switchCamera?: () => void;
    };

    if (typeof videoTrack?._switchCamera === 'function') {
      videoTrack._switchCamera();
      return;
    }

    const next = (await this.webrtc.mediaDevices.getUserMedia({
      audio: this.micEnabled,
      video: {
        facingMode: this.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })) as MediaStream;

    const oldVideo = this.localStream.getVideoTracks()[0];
    const newVideo = next.getVideoTracks()[0];
    if (oldVideo && newVideo && this.pc) {
      const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
      await sender?.replaceTrack(newVideo);
      oldVideo.stop();
      this.localStream.removeTrack(oldVideo);
      this.localStream.addTrack(newVideo);
      this.callbacks.onLocalStream?.(this.localStream);
    }
  }

  createPeerConnection() {
    this.closePeerConnection(false);

    const { RTCPeerConnection } = this.webrtc;
    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 4,
    });

    pc.onicecandidate = (event: { candidate?: RTCIceCandidate | null }) => {
      if (event.candidate) {
        this.callbacks.onIceCandidate?.(event.candidate);
      }
    };

    pc.ontrack = (event: { streams?: MediaStream[] }) => {
      const stream = event.streams?.[0];
      if (stream) {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = this.remoteAudioEnabled;
        });
        this.remoteStream = stream;
        this.callbacks.onRemoteStream?.(this.remoteStream);
      }
    };

    pc.onconnectionstatechange = () => {
      this.callbacks.onConnectionStateChange?.(pc.connectionState);
      this.callbacks.onDebug?.(this.getDebugState());
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      this.callbacks.onIceConnectionStateChange?.(state);
      this.callbacks.onDebug?.(this.getDebugState());
      if (state === 'connected' || state === 'completed') {
        this.clearRestartTimer();
      } else if (state === 'disconnected') {
        // Give ICE a short window to recover on its own before forcing a restart.
        this.scheduleRestart(2500);
      } else if (state === 'failed') {
        this.clearRestartTimer();
        this.callbacks.onRestartNeeded?.();
      }
    };

    pc.onsignalingstatechange = () => {
      this.callbacks.onDebug?.(this.getDebugState());
    };

    if (this.role === 'camera') {
      this.localStream?.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
      // Must exist before createOffer() so the SDP includes the data channel.
      this.attachControlChannel(pc.createDataChannel('control'));
    } else {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ondatachannel = (event: { channel: RTCDataChannel }) => {
        if (event.channel.label === 'control') this.attachControlChannel(event.channel);
      };
    }

    this.pc = pc;
    return pc;
  }

  private attachControlChannel(channel: RTCDataChannel) {
    this.controlChannel = channel;
    const isCurrent = () => this.controlChannel === channel;
    channel.onopen = () => {
      if (isCurrent()) this.callbacks.onControlChannelChange?.(true);
    };
    channel.onclose = () => {
      if (isCurrent()) this.callbacks.onControlChannelChange?.(false);
    };
    channel.onmessage = (event: { data: unknown }) => {
      if (!isCurrent() || typeof event.data !== 'string') return;
      try {
        this.callbacks.onControlMessage?.(JSON.parse(event.data) as ControlMessage);
      } catch {
        // ignore malformed messages
      }
    };
  }

  /** Returns false when the channel is not open yet. */
  sendControl(message: ControlMessage): boolean {
    if (this.controlChannel?.readyState !== 'open') return false;
    this.controlChannel.send(JSON.stringify(message));
    return true;
  }

  async createOffer(options: { iceRestart?: boolean } = {}) {
    if (!this.pc) this.createPeerConnection();
    this.makingOffer = true;
    try {
      const offer = await this.pc!.createOffer(options);
      await this.pc!.setLocalDescription(offer);
      return this.pc!.localDescription;
    } finally {
      this.makingOffer = false;
    }
  }

  /** Re-offer with fresh ICE candidates so the camera can send a restart offer. */
  private scheduleRestart(delayMs: number) {
    if (this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      const state = this.pc?.iceConnectionState;
      if (state === 'disconnected' || state === 'failed') {
        this.callbacks.onRestartNeeded?.();
      }
    }, delayMs);
  }

  private clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  async handleOffer(sdp: RTCSessionDescriptionInit) {
    if (!this.pc) this.createPeerConnection();
    const { RTCSessionDescription } = this.webrtc;
    await this.pc!.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);
    return this.pc!.localDescription;
  }

  async handleAnswer(sdp: RTCSessionDescriptionInit) {
    if (!this.pc || this.pc.signalingState !== 'have-local-offer') return;
    const { RTCSessionDescription } = this.webrtc;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc || !candidate) return;
    const { RTCIceCandidate } = this.webrtc;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      if (this.pc.remoteDescription) {
        throw error;
      }
    }
  }

  setRemoteAudioEnabled(enabled: boolean) {
    this.remoteAudioEnabled = enabled;
    this.remoteStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  closePeerConnection(stopLocal = false) {
    this.clearRestartTimer();
    if (this.controlChannel) {
      try {
        this.controlChannel.close();
      } catch {
        // ignore
      }
      this.controlChannel = null;
      this.callbacks.onControlChannelChange?.(false);
    }

    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }

    if (stopLocal && this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
      this.callbacks.onLocalStream?.(null);
    }

    this.remoteStream = null;
    this.callbacks.onRemoteStream?.(null);
  }

  dispose() {
    this.closePeerConnection(true);
  }

  isMakingOffer() {
    return this.makingOffer;
  }
}
