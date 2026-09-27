import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';
import { isWebRtcAvailable, getWebRtcLoadError } from '@/services/webrtc/native';

export function WebRtcMissingBanner() {
  if (isWebRtcAvailable()) return null;

  const detail = getWebRtcLoadError()?.message;

  return (
    <View style={styles.banner}>
      <Text style={styles.title}>Development build required</Text>
      <Text style={styles.body}>
        WebRTC is not available in Expo Go. Build and install a Camora development client, then
        reopen the app with `npm start`.
      </Text>
      <Text style={styles.code}>npx expo run:android</Text>
      <Text style={styles.code}>eas build --platform android --profile development</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.warning,
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.md,
    gap: 8,
  },
  title: {
    color: Colors.warning,
    fontWeight: '800',
    fontSize: 15,
  },
  body: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  code: {
    color: Colors.primary,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  detail: {
    color: Colors.danger,
    fontSize: 11,
  },
});
