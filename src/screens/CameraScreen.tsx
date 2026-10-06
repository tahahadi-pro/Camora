import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
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
import { cameraHost, useCameraHost } from '@/services/cameraHost';
import { isWebRtcAvailable } from '@/services/webrtc/native';
import { config } from '@/utils/config';
import { encodeConnectionPayload, toDeepLink } from '@/utils/connectionPayload';
import {
  CAMERA_SLOTS,
  clearSavedCameraSlot,
  isValidCameraSlot,
  loadSavedCameraSlot,
} from '@/utils/cameraSlots';

type ScreenPhase = 'permissions' | 'ready' | 'error';

const STATUS_TEXT = {
  idle: 'Stopped',
  connecting: 'Connecting to server…',
  standby: 'Ready — camera opens when a viewer joins',
  live: 'Streaming to viewer',
} as const;

const PILL = {
  idle: { label: 'READY', tone: 'disconnected' },
  connecting: { label: 'CONNECTING', tone: 'connecting' },
  standby: { label: 'STANDBY', tone: 'connecting' },
  live: { label: 'LIVE', tone: 'live' },
} as const;

export default function CameraScreen() {
  const host = useCameraHost();
  const [phase, setPhase] = useState<ScreenPhase>('permissions');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const params = useLocalSearchParams<{ slot?: string }>();
  const requestedSlot =
    params.slot && isValidCameraSlot(params.slot) ? Number(params.slot) : null;
  const [savedSlot, setSavedSlot] = useState<number | null>(loadSavedCameraSlot);
  const [selectedSlot, setSelectedSlot] = useState(
    requestedSlot ?? host.slot ?? savedSlot ?? 1,
  );
  const [fullscreen, setFullscreen] = useState(false);
  const { network } = useNetworkStatus();
  const isDev = useDevMode();

  const streaming = host.slot != null;
  const error = permissionError ?? host.error;

  const qrPayload = useMemo(() => {
    if (!host.roomCode || !host.sessionToken) return '';
    return encodeConnectionPayload({
      v: 1,
      roomCode: host.roomCode,
      sessionToken: host.sessionToken,
      signalingUrl: config.signalingUrl,
      cameraId: host.cameraId,
    });
  }, [host.roomCode, host.sessionToken, host.cameraId]);

  const deepLink = useMemo(() => {
    if (!host.roomCode || !host.sessionToken) return '';
    return toDeepLink({
      v: 1,
      roomCode: host.roomCode,
      sessionToken: host.sessionToken,
      signalingUrl: config.signalingUrl,
      cameraId: host.cameraId,
    });
  }, [host.roomCode, host.sessionToken, host.cameraId]);

  /** Resolves to whether the mic is allowed, or null when the camera was denied. */
  const requestPermissions = useCallback(async () => {
    setPermissionError(null);
    const cam = await Camera.requestCameraPermissionsAsync();
    if (!cam.granted) {
      setPhase('error');
      setPermissionError(ERROR_MESSAGES.CAMERA_PERMISSION_DENIED);
      return null;
    }

    const mic = await Camera.requestMicrophonePermissionsAsync();
    if (!mic.granted) {
      // Mic is optional — warn but continue
      Alert.alert('Microphone', ERROR_MESSAGES.MICROPHONE_PERMISSION_DENIED);
    }

    setPhase('ready');
    return mic.granted;
  }, []);

  useEffect(() => {
    if (!isWebRtcAvailable()) return;
    void (async () => {
      const micGranted = await requestPermissions();
      if (micGranted == null) return;
      // A number typed on the home screen always wins; otherwise resume the saved one.
      const target = requestedSlot ?? (cameraHost.isRunning() ? null : savedSlot);
      if (target != null) await cameraHost.start(target, { micOn: micGranted });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'ready') return;
    return cameraHost.acquirePreview();
  }, [phase]);

  useEffect(() => {
    if (!streaming) return;
    void activateKeepAwakeAsync('camora-stream');
    return () => {
      void deactivateKeepAwake('camora-stream');
    };
  }, [streaming]);

  const startStreaming = async () => {
    await cameraHost.start(selectedSlot);
    setSavedSlot(selectedSlot);
  };

  const forgetNumber = async () => {
    await cameraHost.stop();
    clearSavedCameraSlot();
    setSavedSlot(null);
  };

  const toggleMic = async () => {
    const next = !host.micOn;
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
    await cameraHost.setMicOn(next);
  };

  const streamUrl = host.localStream?.toURL?.() ?? null;
  const pill = PILL[host.status];

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

  if (phase === 'error') {
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
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>← Camera</Text>
          </Pressable>
          <StatusPill label={pill.label} tone={pill.tone} />
        </View>
      )}

      <View style={styles.videoShell}>
        {streamUrl ? (
          <CamoraRTCView
            streamURL={streamUrl}
            style={styles.video}
            objectFit="cover"
            mirror={host.facing === 'user'}
          />
        ) : (
          <View style={styles.placeholder}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.muted}>Starting camera…</Text>
          </View>
        )}
        <View style={styles.liveBadge}>
          <StatusPill
            label={host.viewerConnected ? 'LIVE' : 'PREVIEW'}
            tone={host.viewerConnected ? 'live' : 'connecting'}
          />
        </View>
      </View>

      {!fullscreen && (
        <ScrollView contentContainerStyle={styles.bottom} keyboardShouldPersistTaps="handled">
          <Text style={[styles.meta, !network.isConnected && styles.error]}>
            Internet: {network.isConnected ? `Connected (${network.details})` : 'Internet connection lost'}
          </Text>
          <Text style={styles.meta}>Streaming: {STATUS_TEXT[host.status]}</Text>
          <Text style={[styles.meta, host.viewerConnected ? styles.good : undefined]}>
            Viewer: {host.viewerConnected ? 'Connected' : 'Waiting'}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!streaming ? (
            <View style={styles.slotBlock}>
              <Text style={styles.slotLabel}>This phone’s camera number</Text>
              <Text style={styles.meta}>
                {savedSlot == null
                  ? 'Pick a number once. It is saved and this phone stays reachable on it every time Camora runs.'
                  : `Default: Camera ${savedSlot}. Pick a number and press Start to change it.`}
              </Text>
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

          {streaming ? (
            <>
              <Text style={styles.slotLabel}>
                Camera number: {host.cameraId || host.slot} — viewers enter this number to watch
              </Text>
              <Text style={styles.note}>
                {Platform.OS === 'android'
                  ? 'You can leave this screen, close Camora to the background or lock the phone. The camera turns on by itself when a viewer starts watching.'
                  : 'You can leave this screen. Keep Camora open on this iPhone — iOS does not allow the camera to run in the background.'}
              </Text>
            </>
          ) : null}

          {streaming && qrPayload ? (
            <ConnectionCard
              value={deepLink || qrPayload}
              cameraId={host.cameraId}
              roomCode={host.roomCode}
            />
          ) : null}

          <View style={styles.controls}>
            <ControlButton
              variant={streaming ? 'danger' : 'primary'}
              label={streaming ? 'Stop' : 'Start'}
              onPress={() => void (streaming ? cameraHost.stop() : startStreaming())}
            />
            <ControlButton label="Switch Cam" onPress={() => void cameraHost.switchCamera()} />
            <ControlButton
              label={host.micOn ? 'Mic ON' : 'Mic OFF'}
              onPress={() => void toggleMic()}
            />
            <ControlButton label="Fullscreen" onPress={() => setFullscreen(true)} />
            {savedSlot != null ? (
              <ControlButton label="Forget number" onPress={() => void forgetNumber()} />
            ) : null}
          </View>

          {isDev && (
            <DebugPanel
              visible
              debug={host.debug}
              networkType={network.details}
              extra={{
                Peer: host.peerState,
                Facing: host.facing,
                Mic: host.micOn ? 'on' : 'off',
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
  note: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
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
