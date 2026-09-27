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
};

/**
 * WebRTC peer helper for Camora camera/viewer sessions.
 */
export class WebRtcSession {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private role: PeerRole;
  private facingMode: 'environment' | 'user' = 'environment';
  private micEnabled = false;
  private callbacks: PeerCallbacks;
  private makingOffer = false;
  private webrtc = requireWebRtc();

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
    this.callbacks.onLocalStream?.(this.localStream);
    return this.localStream;
  }

  async setMicrophoneEnabled(enabled: boolean) {
    this.micEnabled = enabled;

    if (!this.localStream) return;

    const audioTracks = this.localStream.getAudioTracks();
    if (enabled && audioTracks.length === 0) {
      const audioOnly = (await this.webrtc.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      })) as MediaStream;
      audioOnly.getAudioTracks().forEach((track) => {
        this.localStream?.addTrack(track);
        this.pc?.addTrack(track, this.localStream!);
      });
    } else {
      audioTracks.forEach((track) => {
        track.enabled = enabled;
      });
    }
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
        this.remoteStream = stream;
        this.callbacks.onRemoteStream?.(this.remoteStream);
      }
    };

    pc.onconnectionstatechange = () => {
      this.callbacks.onConnectionStateChange?.(pc.connectionState);
      this.callbacks.onDebug?.(this.getDebugState());
    };

    pc.oniceconnectionstatechange = () => {
      this.callbacks.onIceConnectionStateChange?.(pc.iceConnectionState);
      this.callbacks.onDebug?.(this.getDebugState());
      if (pc.iceConnectionState === 'failed') {
        this.callbacks.onError?.(
          'WebRTC ICE failed. A TURN server is usually required across mobile networks.',
        );
      }
    };

    pc.onsignalingstatechange = () => {
      this.callbacks.onDebug?.(this.getDebugState());
    };

    if (this.role === 'camera' && this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    } else if (this.role === 'viewer') {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    this.pc = pc;
    return pc;
  }

  async createOffer() {
    if (!this.pc) this.createPeerConnection();
    this.makingOffer = true;
    try {
      const offer = await this.pc!.createOffer({});
      await this.pc!.setLocalDescription(offer);
      return this.pc!.localDescription;
    } finally {
      this.makingOffer = false;
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
    if (!this.pc) return;
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
    this.remoteStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  closePeerConnection(stopLocal = false) {
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
