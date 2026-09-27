import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';
import { StatusPill } from '@/components/ControlButton';

type Props = {
  live: boolean;
  internetLabel: string;
  internetOk: boolean;
  peerLabel: string;
  peerOk: boolean | null;
  title?: string;
};

export function StatusBar({
  live,
  internetLabel,
  internetOk,
  peerLabel,
  peerOk,
  title = 'Camora',
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Text style={styles.title}>{title}</Text>
        <StatusPill
          label={live ? 'LIVE' : 'IDLE'}
          tone={live ? 'live' : 'disconnected'}
        />
      </View>
      <Text style={[styles.meta, !internetOk && styles.bad]}>
        Internet: {internetLabel}
      </Text>
      <Text
        style={[
          styles.meta,
          peerOk === true && styles.good,
          peerOk === false && styles.bad,
        ]}>
        {peerLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  meta: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  good: {
    color: Colors.live,
  },
  bad: {
    color: Colors.danger,
  },
});
