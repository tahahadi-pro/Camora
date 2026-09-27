import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';
import type { WebRtcDebugState } from '@/services/webrtc/session';

type Props = {
  visible: boolean;
  debug: WebRtcDebugState | null;
  networkType: string;
  resolution?: string;
  extra?: Record<string, string | number | null | undefined>;
};

export function DebugPanel({ visible, debug, networkType, resolution, extra }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>DEV DEBUG</Text>
      <Row label="ICE" value={debug?.iceConnectionState ?? '—'} />
      <Row label="Peer" value={debug?.connectionState ?? '—'} />
      <Row label="Signaling" value={debug?.signalingState ?? '—'} />
      <Row label="Gathering" value={debug?.iceGatheringState ?? '—'} />
      <Row label="Network" value={networkType} />
      <Row label="Resolution" value={resolution ?? '—'} />
      {extra &&
        Object.entries(extra).map(([k, v]) => (
          <Row key={k} label={k} value={v == null ? '—' : String(v)} />
        ))}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  title: {
    color: Colors.warning,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 1,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  value: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
});
