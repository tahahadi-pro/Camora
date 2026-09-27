import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Colors, Spacing } from '@/constants/theme';

type Props = {
  value: string;
  cameraId: string;
  roomCode: string;
};

export function ConnectionCard({ value, cameraId, roomCode }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Camera ready</Text>
      <View style={styles.qrWrap}>
        <QRCode value={value} size={168} backgroundColor={Colors.text} color={Colors.background} />
      </View>
      <InfoRow label="CAMERA NUMBER" value={roomCode || cameraId} emphasize />
      <Text style={styles.hint}>
        On the viewer phone, enter this number (1–10) to watch. Or scan the QR code.
      </Text>
    </View>
  );
}

function InfoRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, emphasize && styles.emphasize]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 18,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    alignItems: 'center',
  },
  heading: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
    alignSelf: 'flex-start',
  },
  qrWrap: {
    padding: Spacing.md,
    backgroundColor: Colors.text,
    borderRadius: 16,
  },
  row: {
    alignSelf: 'stretch',
    gap: 4,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 12,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  value: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
  },
  emphasize: {
    color: Colors.primary,
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    alignSelf: 'stretch',
  },
});
