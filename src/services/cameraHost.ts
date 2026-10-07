import { useSyncExternalStore } from 'react';
import { AppRegistry, AppState } from 'react-native';
import { Camera } from 'expo-camera';
import { ERROR_MESSAGES } from '@/constants/theme';
import { SignalingClient } from '@/services/signaling/client';
import { isWebRtcAvailable } from '@/services/webrtc/native';
import { WebRtcSession, WebRtcDebugState } from '@/services/webrtc/session';
import { loadSavedCameraSlot, saveCameraSlot } from '@/utils/cameraSlots';
import { config } from '@/utils/config';
import { mapServerError } from '@/utils/errors';
import {
  KEEP_ALIVE_TASK,
  consumeBackgroundLaunch,
  moveAppToBackground,
  setAutoStartEnabled,
  startBackgroundService,
  startKeepAlive,
  stopBackgroundService,
  stopKeepAlive,
  updateBackgroundService,
} from '../../modules/camora-background';

type MediaStream = import('react-native-webrtc').MediaStream;

/**
 * idle: not registered. connecting: waiting for the server to hand out the number.
 * standby: number claimed, camera closed until a viewer joins. live: viewer is watching.
 */
export type CameraHostStatus = 'idle' | 'connecting' | 'standby' | 'live';

export type CameraHostState = {
  status: CameraHostStatus;
  slot: number | null;
  roomCode: string;
  cameraId: string;
  sessionToken: string;
  viewerConnected: boolean;
  localStream: MediaStream | null;
  micOn: boolean;
  facing: 'environment' | 'user';
  peerState: string;
  debug: WebRtcDebugState | null;
  error: string | null;
};

let releaseKeepAliveTask: (() => void) | null = null;

// Does no work itself: while its promise is pending, Android keeps JS timers running in the background.
AppRegistry.registerHeadlessTask(KEEP_ALIVE_TASK, () => () =>
  new Promise<void>((resolve) => {
    releaseKeepAliveTask?.();
    releaseKeepAliveTask = resolve;
  }),
);

const RECLAIM_RETRY_MS = 5000;
const BACKGROUND_LAUNCH_SETTLE_MS = 2000;
const NOTIFICATION_TITLE = 'Camora';

/**
 * Keeps this phone registered as its camera number for the whole app lifetime, not just
 * while the camera screen is open. The camera itself is only opened when a viewer joins
 * (or the camera screen shows a preview), so the phone can sit idle in the background.
 */
class CameraHost {
  private state: CameraHostState = {
    status: 'idle',
    slot: null,
    roomCode: '',
    cameraId: '',
    sessionToken: '',
    viewerConnected: false,
    localStream: null,
    micOn: false,
    facing: 'environment',
    peerState: 'new',
    debug: null,
    error: null,
  };
  private listeners = new Set<() => void>();
  // Separate socket so the Watch Live screen on the same phone cannot disconnect the camera.
  private signaling = new SignalingClient();
  private session: WebRtcSession | null = null;
  private cameraPromise: Promise<void> | null = null;
  private previewHolders = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private restarting = false;

  getState = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<CameraHostState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  isRunning() {
    return this.state.slot != null;
  }

  async start(slot: number, options: { micOn?: boolean } = {}) {
    if (!isWebRtcAvailable() || this.state.slot === slot) return;
    if (this.state.slot != null) await this.stop();

    saveCameraSlot(slot);
    setAutoStartEnabled(true);
    this.set({ status: 'connecting', slot, error: null, micOn: options.micOn ?? this.state.micOn });
    this.connectSignaling(slot);
    await this.showNotification(`Camera ${slot} is ready — viewers can watch anytime`);
    await this.prepareCamera();
  }

  reconnectIfNeeded() {
    if (this.state.slot == null || this.signaling.isConnected()) return;
    this.signaling.getSocket()?.connect();
  }

  /**
   * react-native-webrtc can only create the camera while an Activity exists, i.e. while the
   * app is open. Create it now and keep it paused, so a viewer can resume it later from the
   * background.
   */
  async prepareCamera() {
    if (this.state.slot == null || this.session?.getLocalStream()) return;
    try {
      await this.ensureCamera();
    } catch (e) {
      console.warn('Camera could not be prepared', e);
    }
    this.releaseCameraIfUnused();
  }

  async stop() {
    this.clearRetry();
    this.set({
      status: 'idle',
      slot: null,
      roomCode: '',
      cameraId: '',
      sessionToken: '',
      viewerConnected: false,
      peerState: 'new',
      error: null,
    });
    if (this.signaling.isConnected()) {
      try {
        await this.signaling.leaveRoom();
      } catch {
        // ignore
      }
    }
    this.signaling.disconnect();
    this.session?.closePeerConnection(false);
    this.releaseCameraIfUnused();
    await this.hideNotification();
  }

  /** Opens the camera for an on-screen preview; call the returned function to release it. */
  acquirePreview() {
    this.previewHolders += 1;
    void this.ensureCamera().catch((e) => {
      this.set({ error: e instanceof Error ? e.message : ERROR_MESSAGES.WEBRTC_FAILED });
    });
    return () => {
      this.previewHolders = Math.max(0, this.previewHolders - 1);
      this.releaseCameraIfUnused();
    };
  }

  async setMicOn(micOn: boolean) {
    this.set({ micOn });
    const session = this.session;
    if (!session) return;
    const trackAdded = await session.setMicrophoneEnabled(micOn);
    // A newly added audio track only reaches the viewer after renegotiating the call.
    if (trackAdded && this.state.roomCode && session.getPeerConnection()) {
      try {
        const offer = await session.createOffer();
        this.signaling.sendOffer(this.state.roomCode, offer);
      } catch (e) {
        console.warn('Mic renegotiation failed', e);
      }
    }
  }

  async switchCamera() {
    this.set({ facing: this.state.facing === 'environment' ? 'user' : 'environment' });
    if (this.session?.getLocalStream()) {
      await this.session.switchCamera();
    }
  }

  private connectSignaling(slot: number) {
    const signaling = this.signaling;
    signaling.connect(config.signalingUrl);

    signaling.on('connect', () => void this.claim(slot));

    signaling.on('connect_error', () => {
      this.set({ error: ERROR_MESSAGES.SIGNALING_UNAVAILABLE });
    });

    // socket.io keeps reconnecting on its own; the server frees the number, so reclaim on connect.
    signaling.on('disconnect', () => {
      this.dropViewer();
      this.set({ status: 'connecting', error: ERROR_MESSAGES.SIGNALING_UNAVAILABLE });
    });

    signaling.on('viewer-connected', () => void this.onViewerConnected());

    signaling.on('answer', async ({ sdp, roomCode }) => {
      if (roomCode !== this.state.roomCode) return;
      try {
        await this.session?.handleAnswer(sdp as never);
      } catch (e) {
        console.warn(e);
        this.set({ error: ERROR_MESSAGES.WEBRTC_FAILED });
      }
    });

    signaling.on('ice-candidate', async ({ candidate, roomCode }) => {
      if (roomCode !== this.state.roomCode) return;
      try {
        await this.session?.addIceCandidate(candidate as never);
      } catch (e) {
        console.warn('ICE', e);
      }
    });

    signaling.on('viewer-disconnected', () => this.dropViewer());
  }

  private async claim(slot: number) {
    this.clearRetry();
    if (this.state.slot !== slot) return;
    try {
      const result = await this.signaling.createRoom(slot);
      if (this.state.slot !== slot) return;
      if (!result.ok) throw new Error(result.error || 'CREATE_FAILED');
      this.set({
        status: this.state.viewerConnected ? 'live' : 'standby',
        roomCode: result.roomCode,
        cameraId: result.cameraId,
        sessionToken: result.sessionToken,
        error: null,
      });
    } catch (e) {
      if (this.state.slot !== slot) return;
      const code = e instanceof Error ? e.message : '';
      const mapped = mapServerError(code);
      const message = mapped !== code ? mapped : ERROR_MESSAGES.SIGNALING_UNAVAILABLE;
      this.set({ error: `${message} Retrying automatically…` });
      if (this.signaling.isConnected()) {
        this.retryTimer = setTimeout(() => void this.claim(slot), RECLAIM_RETRY_MS);
      }
    }
  }

  private async onViewerConnected() {
    this.set({ viewerConnected: true, status: 'live', error: null });
    void this.updateNotification(`Camera ${this.state.slot} is streaming to a viewer`);
    try {
      const session = await this.ensureCamera();
      if (!this.state.viewerConnected) return;
      session.createPeerConnection();
      const offer = await session.createOffer();
      this.signaling.sendOffer(this.state.roomCode, offer);
    } catch (e) {
      console.warn(e);
      this.set({ error: ERROR_MESSAGES.WEBRTC_FAILED });
    }
  }

  /**
   * Recovers a dropped call without the viewer having to reconnect: sends a fresh
   * offer with ICE restart so a new (possibly relayed) path can be negotiated.
   */
  private async restartConnection() {
    if (this.state.slot == null || !this.state.viewerConnected) return;
    const session = this.session;
    if (!session || !this.state.roomCode || !session.getPeerConnection()) return;
    if (this.restarting) return;
    this.restarting = true;
    try {
      const offer = await session.createOffer({ iceRestart: true });
      if (offer) this.signaling.sendOffer(this.state.roomCode, offer);
    } catch (e) {
      console.warn('ICE restart failed', e);
    } finally {
      this.restarting = false;
    }
  }

  private dropViewer() {
    if (!this.state.viewerConnected) return;
    this.session?.closePeerConnection(false);
    this.set({
      viewerConnected: false,
      peerState: 'new',
      status: this.state.status === 'live' ? 'standby' : this.state.status,
    });
    void this.updateNotification(`Camera ${this.state.slot} is ready — viewers can watch anytime`);
    this.releaseCameraIfUnused();
  }

  private getSession() {
    if (!this.session) {
      this.session = new WebRtcSession('camera', {
        onLocalStream: (localStream) => this.set({ localStream }),
        onIceCandidate: (candidate) => {
          if (this.state.roomCode) {
            this.signaling.sendIceCandidate(this.state.roomCode, candidate);
          }
        },
        onConnectionStateChange: (peerState) => this.set({ peerState }),
        onDebug: (debug) => this.set({ debug }),
        onError: (error) => this.set({ error }),
        onRestartNeeded: () => void this.restartConnection(),
        onControlMessage: (message) => {
          if (message.type === 'switch-camera') void this.switchCamera();
        },
      });
    }
    return this.session;
  }

  private async ensureCamera() {
    const session = this.getSession();
    if (!session.getLocalStream()) {
      this.cameraPromise ??= session
        .startCamera({ facingMode: this.state.facing, audio: this.state.micOn })
        .then(() => undefined)
        .finally(() => {
          this.cameraPromise = null;
        });
      await this.cameraPromise;
    }
    this.setVideoCapturing(true);
    return session;
  }

  /** Disabling a video track stops the native capturer (camera off) without destroying it. */
  private setVideoCapturing(capturing: boolean) {
    this.session
      ?.getLocalStream()
      ?.getVideoTracks()
      .forEach((track) => {
        if (track.enabled !== capturing) track.enabled = capturing;
      });
  }

  /** Turns the camera off when neither a viewer nor the camera screen needs it. */
  private releaseCameraIfUnused() {
    if (this.previewHolders > 0 || this.state.viewerConnected) return;
    if (this.cameraPromise) {
      void this.cameraPromise.catch(() => {}).then(() => this.releaseCameraIfUnused());
      return;
    }
    if (this.state.slot != null) {
      this.setVideoCapturing(false);
      return;
    }
    this.session?.dispose();
    this.session = null;
  }

  private clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  // Notification permission is deliberately never requested, so Android 13+ hides the
  // foreground-service notification that Android requires for background camera access.
  private async showNotification(body: string) {
    try {
      await startBackgroundService(NOTIFICATION_TITLE, body);
      await startKeepAlive();
    } catch (e) {
      console.warn('Background camera service failed to start', e);
    }
  }

  private async updateNotification(body: string) {
    try {
      await updateBackgroundService(NOTIFICATION_TITLE, body);
    } catch {
      // ignore
    }
  }

  private async hideNotification() {
    releaseKeepAliveTask?.();
    releaseKeepAliveTask = null;
    try {
      await stopKeepAlive();
      await stopBackgroundService();
    } catch {
      // ignore
    }
  }
}

export const cameraHost = new CameraHost();

export function useCameraHost() {
  return useSyncExternalStore(cameraHost.subscribe, cameraHost.getState);
}

/**
 * Re-registers the saved camera number at app launch so viewers can connect without
 * anyone opening the camera screen. Needs camera permission granted earlier.
 */
export async function resumeSavedCameraHost() {
  const autoLaunched = consumeBackgroundLaunch();
  if (!isWebRtcAvailable() || cameraHost.isRunning()) return;
  const slot = loadSavedCameraSlot();
  if (slot == null) {
    setAutoStartEnabled(false);
    return;
  }
  const cam = await Camera.getCameraPermissionsAsync();
  if (!cam.granted) return;
  const mic = await Camera.getMicrophonePermissionsAsync();
  await cameraHost.start(slot, { micOn: mic.granted });
  if (autoLaunched) {
    // The foreground service must reach startForeground() while the app is still visible.
    await new Promise((resolve) => setTimeout(resolve, BACKGROUND_LAUNCH_SETTLE_MS));
    await moveAppToBackground();
  }
}

/** Stops the camera and stops Camora from re-opening itself after a reboot. */
export async function disableCameraHost() {
  setAutoStartEnabled(false);
  await cameraHost.stop();
}

AppState.addEventListener('change', (next) => {
  if (next !== 'active') return;
  cameraHost.reconnectIfNeeded();
  void cameraHost.prepareCamera();
});
