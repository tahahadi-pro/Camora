import { ControlButton } from '@/components/ControlButton';
import { WebRtcMissingBanner } from '@/components/WebRtcMissingBanner';
import { Colors, Spacing } from '@/constants/theme';
import { isWebRtcAvailable } from '@/services/webrtc/native';
import { config } from '@/utils/config';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const webrtcReady = isWebRtcAvailable();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.brand}>CAMORA</Text>
          <WebRtcMissingBanner />
        </View>

        <View style={styles.actions}>
          <ControlButton
            large
            variant="primary"
            label="Start Camera"
            disabled={!webrtcReady}
            onPress={() => router.push('/camera')}
          />
          <ControlButton
            large
            label="View Camera"
            disabled={!webrtcReady}
            onPress={() => router.push('/viewer')}
          />
        </View>

        <Text style={styles.footer}>
          Signaling: {config.signalingUrl}
          {'\n'}
          {webrtcReady
            ? 'WebRTC native module loaded.'
            : 'Requires a development build (WebRTC is not available in Expo Go).'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.md,
  },
  brand: {
    color: Colors.primary,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 4,
  },
  actions: {
    gap: Spacing.md,
  },
  footer: {
    marginTop: Spacing.lg,
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
