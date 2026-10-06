import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CamoraRTCView } from '@/components/CamoraRTCView';
import { ControlButton, StatusPill } from '@/components/ControlButton';
import { DebugPanel } from '@/components/DebugPanel';
import { WebRtcMissingBanner } from '@/components/WebRtcMissingBanner';
import { Colors, ERROR_MESSAGES, Spacing } from '@/constants/theme';
import { useLatency, useDevMode } from '@/hooks/useLatency';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { signaling } from '@/services/signaling/client';
import { isWebRtcAvailable } from '@/services/webrtc/native';
import { WebRtcSession, WebRtcDebugState } from '@/services/webrtc/session';
import { config } from '@/utils/config';
import { parseConnectionPayload } from '@/utils/connectionPayload';
import { formatLatency, mapServerError } from '@/utils/errors';
import { normalizeCameraCode } from '@/utils/cameraSlots';

type MediaStream = import('react-native-webrtc').MediaStream;

type Phase = 'enter' | 'connecting' | 'waiting' | 'live' | 'lost';

const WAIT_RETRY_MS = 3000;
const WAITABLE_ERRORS = new Set(['CAMERA_OFFLINE', 'ROOM_NOT_FOUND']);

export default function ViewerScreen() {
  const params = useLocalSearchParams<{ code?: string; token?: string; payload?: string }>();
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('enter');
  const [error, setError] = useState<string | null>(null);
  const [cameraId, setCameraId] = useState<string>('');
  const [roomCode, setRoomCode] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [debug, setDebug] = useState<WebRtcDebugState | null>(null);
  const [peerState, setPeerState] = useState('new');

  const sessionRef = useRef<WebRtcSession | null>(null);
  const roomCodeRef = useRef('');
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(room: string, token?: string, signalingUrl?: string) => Promise<void>>(
    async () => {},
  );
  const { network, onReconnect } = useNetworkStatus();
  const latencyMs = useLatency(phase === 'live');
  const isDev = useDevMode();

  const clearWait = useCallback(() => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(
    (room: string, token = '', signalingUrl = '') => {
      if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
      waitTimerRef.current = setTimeout(
        () => void connectRef.current(room, token, signalingUrl),
        WAIT_RETRY_MS,
      );
    },
    [],
  );

  const cleanup = useCallback(async () => {
    try {
      await signaling.leaveRoom();
    } catch {
      // ignore
    }
    signaling.disconnect();
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setRemoteStream(null);
  }, []);

  useEffect(() => {
    return () => {
      clearWait();
      cleanup();
    };
  }, [cleanup, clearWait]);

  useEffect(() => {
    if (!isWebRtcAvailable()) return;
    if (params.payload) {
      const parsed = parseConnectionPayload(String(params.payload));
      if (parsed) {
        setCode(parsed.roomCode);
        setSessionToken(parsed.sessionToken);
        void connect(parsed.roomCode, parsed.sessionToken, parsed.signalingUrl);
      }
    } else if (params.code) {
      setCode(String(params.code));
      const token = params.token ? String(params.token) : '';
      setSessionToken(token);
      void connect(String(params.code), token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachSignalingHandlers = useCallback((session: WebRtcSession, activeRoom: string) => {
    signaling.on('offer', async ({ sdp, roomCode: rc }) => {
      if (rc !== activeRoom) return;
      try {
        const answer = await session.handleOffer(sdp as never);
        signaling.sendAnswer(activeRoom, answer);
      } catch (e) {
        setError(ERROR_MESSAGES.WEBRTC_FAILED);
        console.warn(e);
      }
    });

    signaling.on('ice-candidate', async ({ candidate, roomCode: rc }) => {
      if (rc !== activeRoom) return;
      try {
        await session.addIceCandidate(candidate as never);
      } catch (e) {
        console.warn('ICE add failed', e);
      }
    });

    signaling.on('camera-disconnected', () => {
      setPhase('waiting');
      setError(null);
      setRemoteStream(null);
      scheduleRetry(activeRoom);
    });

    signaling.on('disconnect', () => {
      if (roomCodeRef.current) {
        setPhase((p) => (p === 'live' ? 'lost' : p));
      }
    });
  }, [scheduleRetry]);

  const connect = useCallback(
    async (room: string, token = '', signalingUrl = '') => {
      if (!isWebRtcAvailable()) {
        setError('WebRTC requires a development build.');
        return;
      }

      const normalized = normalizeCameraCode(room);
      if (!normalized) {
        setError(ERROR_MESSAGES.INVALID_CAMERA_CODE);
        return;
      }

      clearWait();
      setError(null);
      setPhase((p) => (p === 'waiting' ? 'waiting' : 'connecting'));
      setRoomCode(normalized);
      roomCodeRef.current = normalized;

      try {
        await cleanup();
        const url = signalingUrl || config.signalingUrl;
        const socket = signaling.connect(url);

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

        const result = await signaling.joinRoom(normalized, token || undefined);
        if (!result.ok) {
          if (result.error && WAITABLE_ERRORS.has(result.error)) {
            setPhase('waiting');
            scheduleRetry(normalized, token, signalingUrl);
            return;
          }
          setPhase('enter');
          setError(mapServerError(result.error));
          return;
        }

        setCameraId(result.cameraId);
        setSessionToken(result.sessionToken);

        const session = new WebRtcSession('viewer', {
          onRemoteStream: (stream) => {
            setRemoteStream(stream);
            if (stream) setPhase('live');
          },
          onIceCandidate: (candidate) => {
            signaling.sendIceCandidate(normalized, candidate);
          },
          onConnectionStateChange: (state) => {
            setPeerState(state);
            if (state === 'failed') {
              setPhase('lost');
              setError(ERROR_MESSAGES.WEBRTC_FAILED);
              scheduleRetry(normalized, token, signalingUrl);
            }
            if (state === 'connected') setPhase('live');
          },
          onDebug: setDebug,
          onError: (msg) => setError(msg),
        });

        sessionRef.current = session;
        session.createPeerConnection();
        attachSignalingHandlers(session, normalized);
        setPhase('live');
      } catch (e) {
        if (e instanceof Error && e.message === 'SIGNALING_UNAVAILABLE') {
          setPhase('waiting');
          setError(ERROR_MESSAGES.SIGNALING_UNAVAILABLE);
          scheduleRetry(normalized, token, signalingUrl);
          return;
        }
        setPhase('enter');
        setError(ERROR_MESSAGES.WEBRTC_FAILED);
      }
    },
    [attachSignalingHandlers, cleanup, clearWait, scheduleRetry],
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const cancelWaiting = async () => {
    clearWait();
    roomCodeRef.current = '';
    await cleanup();
    setPhase('enter');
  };

  useEffect(() => {
    onReconnect(() => {
      if (roomCodeRef.current && (phase === 'lost' || phase === 'live')) {
        void connect(roomCodeRef.current, sessionToken);
      }
    });
  }, [network.isConnected, onReconnect, phase, sessionToken, connect]);

  const onConnectPress = () => {
    void connect(code, sessionToken);
  };

  const toggleAudio = () => {
    const next = !audioOn;
    setAudioOn(next);
    sessionRef.current?.setRemoteAudioEnabled(next);
  };

  const takeScreenshotHint = () => {
    Alert.alert(
      'Screenshot',
      'Use your phone’s system screenshot gesture to capture the live view.',
    );
  };

  const streamUrl = useMemo(() => remoteStream?.toURL?.() ?? null, [remoteStream]);

  if (!isWebRtcAvailable()) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.form, { justifyContent: 'center' }]}>
          <WebRtcMissingBanner />
          <ControlButton label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'enter') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>View Camera</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Enter camera number (1–10)</Text>
          <TextInput
            keyboardType="number-pad"
            autoCorrect={false}
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 2))}
            placeholder="1"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            maxLength={2}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <ControlButton large variant="primary" label="CONNECT" onPress={onConnectPress} />
          <ControlButton large label="SCAN QR CODE" onPress={() => router.push('/scan')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, fullscreen && styles.fullscreenSafe]} edges={fullscreen ? [] : undefined}>
      {!fullscreen && (
        <View style={styles.header}>
          <Pressable
            onPress={async () => {
              clearWait();
              await cleanup();
              router.back();
            }}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
          <StatusPill
            label={
              phase === 'live'
                ? 'LIVE'
                : phase === 'connecting'
                  ? 'CONNECTING'
                  : phase === 'waiting'
                    ? 'WAITING'
                    : 'LOST'
            }
            tone={
              phase === 'live'
                ? 'live'
                : phase === 'connecting' || phase === 'waiting'
                  ? 'connecting'
                  : 'disconnected'
            }
          />
        </View>
      )}

      <View style={styles.videoShell}>
        {streamUrl ? (
          <CamoraRTCView streamURL={streamUrl} style={styles.video} objectFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            {phase === 'connecting' ? (
              <>
                <ActivityIndicator color={Colors.primary} size="large" />
                <Text style={styles.placeholderText}>Connecting…</Text>
              </>
            ) : phase === 'waiting' ? (
              <>
                <ActivityIndicator color={Colors.primary} size="large" />
                <Text style={styles.placeholderText}>
                  Waiting for Camera {roomCode} to come online…{'\n'}
                  It connects automatically once the camera phone is streaming.
                </Text>
                <ControlButton label="Cancel" onPress={() => void cancelWaiting()} />
              </>
            ) : (
              <Text style={styles.placeholderText}>{error || 'Waiting for video…'}</Text>
            )}
          </View>
        )}

        <View style={styles.overlayTop}>
          <StatusPill label={phase === 'live' ? 'LIVE' : '…'} tone={phase === 'live' ? 'live' : 'connecting'} />
          <Text style={styles.overlayMeta}>Camera #{cameraId || roomCode}</Text>
        </View>
      </View>

      {!fullscreen && (
        <View style={styles.metaBlock}>
          <Text style={styles.meta}>
            {phase === 'live'
              ? 'Camera Connected'
              : phase === 'lost'
                ? 'Camera connection lost'
                : phase === 'waiting'
                  ? 'Waiting for camera'
                  : 'Connecting'}
          </Text>
          <Text style={styles.meta}>Latency: {formatLatency(latencyMs)}</Text>
          <Text style={[styles.meta, !network.isConnected && styles.error]}>
            Internet: {network.isConnected ? network.details : 'Connection lost'}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      )}

      <View style={styles.controls}>
        <ControlButton label={fullscreen ? 'Exit Full' : 'Fullscreen'} onPress={() => setFullscreen((v) => !v)} />
        <ControlButton label={audioOn ? 'Audio ON' : 'Audio OFF'} onPress={toggleAudio} />
        <ControlButton label="Screenshot" onPress={takeScreenshotHint} />
      </View>

      {phase === 'lost' && (
        <ControlButton
          large
          variant="primary"
          label="RECONNECT"
          onPress={() => void connect(roomCode, sessionToken)}
          style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}
        />
      )}

      {isDev && !fullscreen && (
        <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md }}>
          <DebugPanel
            visible
            debug={debug}
            networkType={network.details}
            extra={{ Peer: peerState, Room: roomCode }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fullscreenSafe: {
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  form: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    justifyContent: 'center',
  },
  label: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    textAlign: 'center',
  },
  videoShell: {
    flex: 1,
    marginHorizontal: Spacing.md,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  video: {
    flex: 1,
    backgroundColor: '#000',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  placeholderText: {
    color: Colors.textMuted,
    textAlign: 'center',
  },
  overlayTop: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overlayMeta: {
    color: Colors.text,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  metaBlock: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: 4,
  },
  meta: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  error: {
    color: Colors.danger,
    fontSize: 13,
  },
});
