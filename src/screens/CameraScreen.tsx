import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera } from 'expo-camera';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { CamoraRTCView } from '@/components/CamoraRTCView';
import { ControlButton, StatusPill } from '@/components/ControlButton';
import { ConnectionCard } from '@/components/ConnectionCard';
import { DebugPanel } from '@/components/DebugPanel';
import { WebRtcMissingBanner } from '@/components/WebRtcMissingBanner';
import { Colors, ERROR_MESSAGES, Spacing } from '@/constants/theme';
import { useDevMode } from '@/hooks/useLatency';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { signaling } from '@/services/signaling/client';
import {
  hideStreamingNotification,
  showStreamingNotification,
} from '@/services/streamingNotification';
import { isWebRtcAvailable } from '@/services/webrtc/native';
import { WebRtcSession, WebRtcDebugState } from '@/services/webrtc/session';
import { config } from '@/utils/config';
import { encodeConnectionPayload, toDeepLink } from '@/utils/connectionPayload';
import { CAMERA_SLOTS } from '@/utils/cameraSlots';
import { mapServerError } from '@/utils/errors';

type MediaStream = import('react-native-webrtc').MediaStream;

type StreamPhase = 'permissions' | 'preview' | 'live' | 'error';

export default function CameraScreen() {
  const [phase, setPhase] = useState<StreamPhase>('permissions');
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [streaming, setStreaming] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [viewerConnected, setViewerConnected] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [fullscreen, setFullscreen] = useState(false);
  const [debug, setDebug] = useState<WebRtcDebugState | null>(null);
  const [peerState, setPeerState] = useState('new');

  const sessionRef = useRef<WebRtcSession | null>(null);
  const roomCodeRef = useRef('');
  const { network } = useNetworkStatus();
  const isDev = useDevMode();

  const qrPayload = useMemo(() => {
    if (!roomCode || !sessionToken) return '';
    return encodeConnectionPayload({
      v: 1,
      roomCode,
      sessionToken,
      signalingUrl: config.signalingUrl,
      cameraId,
    });
  }, [roomCode, sessionToken, cameraId]);

  const deepLink = useMemo(() => {
    if (!roomCode || !sessionToken) return '';
    return toDeepLink({
      v: 1,
      roomCode,
      sessionToken,
      signalingUrl: config.signalingUrl,
      cameraId,
    });
  }, [roomCode, sessionToken, cameraId]);

  const stopEverything = useCallback(async () => {
    setStreaming(false);
    setViewerConnected(false);
    try {
      await signaling.leaveRoom();
    } catch {
      // ignore
    }
    signaling.disconnect();
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setLocalStream(null);
    await hideStreamingNotification();
    deactivateKeepAwake('camora-stream');
  }, []);

  useEffect(() => {
    return () => {
      void stopEverything();
    };
  }, [stopEverything]);

  const requestPermissions = useCallback(async () => {
    setError(null);
    const cam = await Camera.requestCameraPermissionsAsync();
    if (!cam.granted) {
      setPhase('error');
      setError(ERROR_MESSAGES.CAMERA_PERMISSION_DENIED);
      return false;
    }

    const mic = await Camera.requestMicrophonePermissionsAsync();
    if (!mic.granted) {
      // Mic is optional — warn but continue
      Alert.alert('Microphone', ERROR_MESSAGES.MICROPHONE_PERMISSION_DENIED);
    }

    setPhase('preview');
    return true;
  }, []);

  useEffect(() => {
    if (!isWebRtcAvailable()) return;
    void requestPermissions();
  }, [requestPermissions]);

  const ensureLocalPreview = useCallback(async (withAudio: boolean) => {
    if (!isWebRtcAvailable()) return;

    const session =
      sessionRef.current ??
      new WebRtcSession('camera', {
        onLocalStream: setLocalStream,
        onIceCandidate: (candidate) => {
          if (roomCodeRef.current) {
            signaling.sendIceCandidate(roomCodeRef.current, candidate);
          }
        },
        onConnectionStateChange: setPeerState,
        onDebug: setDebug,
        onError: (msg) => setError(msg),
      });

    sessionRef.current = session;

    if (!session.getLocalStream()) {
      await session.startCamera({
        facingMode: facing,
        audio: withAudio,
      });
    }
  }, [facing]);

  useEffect(() => {
    if (!isWebRtcAvailable()) return;
    if (phase === 'preview' || phase === 'live') {
      void ensureLocalPreview(micOn).catch((e) => {
        setError(e instanceof Error ? e.message : ERROR_MESSAGES.WEBRTC_FAILED);
        setPhase('error');
      });
    }
  }, [phase, ensureLocalPreview, micOn]);

  const wireSignaling = useCallback((session: WebRtcSession, code: string) => {
    signaling.on('viewer-connected', async () => {
      setViewerConnected(true);
      try {
        session.createPeerConnection();
        const offer = await session.createOffer();
        signaling.sendOffer(code, offer);
      } catch (e) {
        console.warn(e);
        setError(ERROR_MESSAGES.WEBRTC_FAILED);
      }
    });

    signaling.on('answer', async ({ sdp, roomCode: rc }) => {
      if (rc !== code) return;
      try {
        await session.handleAnswer(sdp as never);
      } catch (e) {
        console.warn(e);
        setError(ERROR_MESSAGES.WEBRTC_FAILED);
      }
    });

    signaling.on('ice-candidate', async ({ candidate, roomCode: rc }) => {
      if (rc !== code) return;
      try {
        await session.addIceCandidate(candidate as never);
      } catch (e) {
        console.warn('ICE', e);
      }
    });

    signaling.on('viewer-disconnected', () => {
      setViewerConnected(false);
      session.closePeerConnection(false);
    });

    signaling.on('disconnect', () => {
      setError(ERROR_MESSAGES.SIGNALING_UNAVAILABLE);
    });
  }, []);

  const startStreaming = async () => {
    setError(null);
    try {
      await ensureLocalPreview(micOn);
      const session = sessionRef.current!;
      const socket = signaling.connect(config.signalingUrl);

      await new Promise<void>((resolve, reject) => {
        if (socket.connected) {
          resolve();
          return;
        }
        const t = setTimeout(() => reject(new Error('SIGNALING_UNAVAILABLE')), 12000);
        socket.once('connect', () => {
          clearTimeout(t);
          resolve();
        });
        socket.once('connect_error', () => {
          clearTimeout(t);
          reject(new Error('SIGNALING_UNAVAILABLE'));
        });
      });

      const result = await signaling.createRoom(selectedSlot);
      if (!result.ok) {
        throw new Error(result.error || 'CREATE_FAILED');
      }

      setRoomCode(result.roomCode);
      setCameraId(result.cameraId);
      setSessionToken(result.sessionToken);
      roomCodeRef.current = result.roomCode;

      wireSignaling(session, result.roomCode);

      setStreaming(true);
      setPhase('live');
      await activateKeepAwakeAsync('camora-stream');
      await showStreamingNotification();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      const message =
        code === 'SIGNALING_UNAVAILABLE'
          ? ERROR_MESSAGES.SIGNALING_UNAVAILABLE
          : mapServerError(code) !== code
            ? mapServerError(code)
            : ERROR_MESSAGES.WEBRTC_FAILED;
      setError(message);
      setStreaming(false);
    }
  };

  const stopStreaming = async () => {
    await stopEverything();
    setRoomCode('');
    setCameraId('');
    setSessionToken('');
    roomCodeRef.current = '';
    setPhase('preview');
    // Restart local preview after stop
    void ensureLocalPreview(micOn);
  };

  const toggleMic = async () => {
    const next = !micOn;
    if (next) {
      const mic = await Camera.getMicrophonePermissionsAsync();
      if (!mic.granted) {
        const req = await Camera.requestMicrophonePermissionsAsync();
        if (!req.granted) {
          Alert.alert('Microphone', ERROR_MESSAGES.MICROPHONE_PERMISSION_DENIED);
          return;
        }
      }
    }
    setMicOn(next);
    await sessionRef.current?.setMicrophoneEnabled(next);
  };

  const switchCamera = async () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    await sessionRef.current?.switchCamera();
  };

  const streamUrl = localStream?.toURL?.() ?? null;

  if (!isWebRtcAvailable()) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <WebRtcMissingBanner />
          <ControlButton label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'permissions') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.muted}>Requesting camera permissions…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'error' && !localStream) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <ControlButton label="Try again" onPress={() => void requestPermissions()} />
          <ControlButton label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, fullscreen && styles.fullBlack]} edges={fullscreen ? [] : undefined}>
      {!fullscreen && (
        <View style={styles.header}>
          <Pressable
            onPress={async () => {
              await stopEverything();
              router.back();
            }}>
            <Text style={styles.back}>← Camera</Text>
          </Pressable>
          <StatusPill
            label={streaming ? 'LIVE' : 'READY'}
            tone={streaming ? 'live' : 'disconnected'}
          />
        </View>
      )}

      <View style={styles.videoShell}>
        {streamUrl ? (
          <CamoraRTCView
            streamURL={streamUrl}
            style={styles.video}
            objectFit="cover"
            mirror={facing === 'user'}
          />
        ) : (
          <View style={styles.placeholder}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.muted}>Starting camera…</Text>
          </View>
        )}
        <View style={styles.liveBadge}>
          <StatusPill label={streaming ? 'LIVE' : 'PREVIEW'} tone={streaming ? 'live' : 'connecting'} />
        </View>
      </View>

      {!fullscreen && (
        <ScrollView contentContainerStyle={styles.bottom} keyboardShouldPersistTaps="handled">
          <Text style={[styles.meta, !network.isConnected && styles.error]}>
            Internet: {network.isConnected ? `Connected (${network.details})` : 'Internet connection lost'}
          </Text>
          <Text style={styles.meta}>
            Streaming: {streaming ? 'Active' : 'Stopped'}
          </Text>
          <Text style={[styles.meta, viewerConnected ? styles.good : undefined]}>
            Viewer: {viewerConnected ? 'Connected' : 'Waiting'}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!streaming ? (
            <View style={styles.slotBlock}>
              <Text style={styles.slotLabel}>This phone’s camera number</Text>
              <View style={styles.slotGrid}>
                {CAMERA_SLOTS.map((slot) => {
                  const active = selectedSlot === slot;
                  return (
                    <Pressable
                      key={slot}
                      onPress={() => setSelectedSlot(slot)}
                      style={[styles.slotChip, active && styles.slotChipActive]}>
                      <Text style={[styles.slotChipText, active && styles.slotChipTextActive]}>
                        {slot}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {streaming && qrPayload ? (
            <ConnectionCard value={deepLink || qrPayload} cameraId={cameraId} roomCode={roomCode} />
          ) : null}

          <View style={styles.controls}>
            <ControlButton
              variant={streaming ? 'danger' : 'primary'}
              label={streaming ? 'Stop' : 'Start'}
              onPress={() => void (streaming ? stopStreaming() : startStreaming())}
            />
            <ControlButton label="Switch Cam" onPress={() => void switchCamera()} />
            <ControlButton
              label={micOn ? 'Mic ON' : 'Mic OFF'}
              onPress={() => void toggleMic()}
            />
            <ControlButton label="Fullscreen" onPress={() => setFullscreen(true)} />
          </View>

          {isDev && (
            <DebugPanel
              visible
              debug={debug}
              networkType={network.details}
              extra={{
                Peer: peerState,
                Facing: facing,
                Mic: micOn ? 'on' : 'off',
                TURN: config.turnServer ? 'configured' : 'missing',
              }}
            />
          )}
        </ScrollView>
      )}

      {fullscreen && (
        <Pressable style={styles.exitFull} onPress={() => setFullscreen(false)}>
          <Text style={styles.back}>Exit Fullscreen</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fullBlack: {
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  back: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  videoShell: {
    height: 320,
    marginHorizontal: Spacing.md,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  video: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  liveBadge: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
  },
  bottom: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  meta: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  slotBlock: {
    gap: Spacing.sm,
  },
  slotLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  slotChip: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  slotChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  slotChipText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  slotChipTextActive: {
    color: Colors.background,
  },
  good: {
    color: Colors.live,
  },
  muted: {
    color: Colors.textMuted,
  },
  error: {
    color: Colors.danger,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  exitFull: {
    position: 'absolute',
    top: 48,
    left: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 8,
  },
});
