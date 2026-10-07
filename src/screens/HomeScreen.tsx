import { WebRtcMissingBanner } from '@/components/WebRtcMissingBanner';
import { Colors, Spacing } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useCameraHost } from '@/services/cameraHost';
import { isWebRtcAvailable } from '@/services/webrtc/native';
import { isValidCameraSlot, loadSavedCameraSlot } from '@/utils/cameraSlots';
import { config } from '@/utils/config';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const logo = require('@/assets/images/icon.png');

function CameraIcon({ color }: { color: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2h6.6l1.4 2h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-9Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13} r={3.6} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function MonitorIcon({ color }: { color: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={4} width={19} height={13} rx={2.5} stroke={color} strokeWidth={1.8} />
      <Path d="M8 21h8M12 17v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M10.5 8.3v4.4l3.8-2.2-3.8-2.2Z" fill={color} />
    </Svg>
  );
}

function ChevronIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="m9 6 6 6-6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type ActionCardProps = {
  title: string;
  subtitle: string;
  icon: (color: string) => React.ReactNode;
  href: Href;
  highlight?: boolean;
  disabled?: boolean;
};

function ActionCard({ title, subtitle, icon, href, highlight, disabled }: ActionCardProps) {
  const accent = highlight ? Colors.background : Colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => router.push(href)}
      style={({ pressed }) => [
        styles.card,
        highlight && styles.cardHighlight,
        pressed && styles.cardPressed,
        disabled && styles.cardDisabled,
      ]}>
      <View style={[styles.cardIcon, highlight && styles.cardIconHighlight]}>{icon(accent)}</View>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, highlight && styles.cardTitleHighlight]}>{title}</Text>
        <Text style={[styles.cardSubtitle, highlight && styles.cardSubtitleHighlight]}>
          {subtitle}
        </Text>
      </View>
      <ChevronIcon color={highlight ? Colors.background : Colors.textMuted} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const webrtcReady = isWebRtcAvailable();
  const { network } = useNetworkStatus();
  const [showDetails, setShowDetails] = useState(false);
  const [cameraNumber, setCameraNumber] = useState('');
  const [savedSlot] = useState(loadSavedCameraSlot);
  const host = useCameraHost();
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
    };
  }, []);

  const openCamera = (slot: string) => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
    setCameraNumber('');
    router.push({ pathname: '/camera', params: { slot } });
  };

  const onCameraNumberChange = (text: string) => {
    const clean = text.replace(/[^0-9]/g, '').slice(0, 2);
    setCameraNumber(clean);
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
    if (!isValidCameraSlot(clean)) return;
    // "1" may be the start of "10", so give the user a moment to type the second digit.
    if (clean === '1') {
      openTimerRef.current = setTimeout(() => openCamera(clean), 1200);
    } else {
      openCamera(clean);
    }
  };

  const statusColor = network.isConnected ? Colors.live : Colors.recording;
  const knownType = network.type === 'wifi' || network.type === 'cellular';
  const statusLabel = !network.isConnected
    ? 'No internet'
    : knownType
      ? `Online · ${network.details}`
      : 'Online';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.topBar}>
          <View style={styles.brandRow}>
            <Image source={logo} style={styles.brandLogo} contentFit="contain" />
            <Text style={styles.brandName}>Camora</Text>
          </View>
          <View
            style={[styles.statusChip, { borderColor: statusColor }]}
            accessibilityLabel={statusLabel}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.hero}>
          <View style={styles.heroLogoWrap}>
            <Image source={logo} style={styles.heroLogo} contentFit="contain" />
          </View>
          <Text style={styles.heroTitle}>Smart Security,{'\n'}Anytime Anywhere</Text>
        </Animated.View>

        {!webrtcReady ? (
          <Animated.View entering={FadeInDown.delay(150).duration(500)}>
            <WebRtcMissingBanner />
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.actions}>
          <Text style={styles.sectionLabel}>What would you like to do?</Text>
          <View style={[styles.numberCard, !webrtcReady && styles.cardDisabled]}>
            <Text style={styles.numberTitle}>Enter camera number (1–10)</Text>
            <Text style={styles.cardSubtitle}>
              This phone starts streaming as that camera right away
              {host.slot == null && savedSlot != null ? ` · Last used: ${savedSlot}` : ''}
            </Text>
            {host.slot != null ? (
              <Text style={styles.hostStatus}>
                {host.viewerConnected
                  ? `Camera ${host.slot} is live — a viewer is watching`
                  : `Camera ${host.slot} is ready in the background — viewers can watch anytime`}
              </Text>
            ) : null}
            <TextInput
              accessibilityLabel="Camera number"
              editable={webrtcReady}
              keyboardType="number-pad"
              returnKeyType="go"
              maxLength={2}
              value={cameraNumber}
              onChangeText={onCameraNumberChange}
              onSubmitEditing={() => {
                // Only "1" waits on a timer; every other valid number has already navigated.
                if (openTimerRef.current && isValidCameraSlot(cameraNumber)) {
                  openCamera(cameraNumber);
                }
              }}
              placeholder={savedSlot != null ? String(savedSlot) : '1'}
              placeholderTextColor={Colors.textMuted}
              style={styles.numberInput}
            />
            {cameraNumber !== '' && !isValidCameraSlot(cameraNumber) ? (
              <Text style={styles.numberError}>Enter a number from 1 to 10</Text>
            ) : null}
          </View>
          <ActionCard
            highlight
            title="Use as Camera"
            subtitle="Stream this phone’s camera"
            icon={(c) => <CameraIcon color={c} />}
            href="/camera"
            disabled={!webrtcReady}
          />
          <ActionCard
            title="Watch Live"
            subtitle="View a camera from this phone"
            icon={(c) => <MonitorIcon color={c} />}
            href="/viewer"
            disabled={!webrtcReady}
          />
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          onPress={() => setShowDetails((v) => !v)}
          style={styles.footer}>
          <Text style={styles.footerToggle}>
            {showDetails ? 'Hide connection details' : 'Connection details'}
          </Text>
          {showDetails ? (
            <Text style={styles.footerDetails}>
              Server: {config.signalingUrl}
              {'\n'}
              {webrtcReady ? 'Video engine ready' : 'Video engine unavailable (Expo Go)'}
            </Text>
          ) : null}
          <Text
            accessibilityRole="button"
            accessibilityLabel="Privacy and stealth settings"
            onPress={() => router.push('/stealth' as Href)}
            style={styles.footerLink}>
            Privacy & stealth
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  brandLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  brandName: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusChip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.surface,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  hero: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  heroLogoWrap: {
    width: 112,
    height: 112,
    borderRadius: 30,
    marginBottom: Spacing.sm,
    boxShadow: '0 0 40px rgba(45, 212, 191, 0.35)',
  },
  heroLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    textAlign: 'center',
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  actions: {
    gap: Spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    minHeight: 84,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  cardHighlight: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cardDisabled: {
    opacity: 0.45,
  },
  numberCard: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceElevated,
  },
  numberTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  numberInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    paddingVertical: Spacing.sm,
    textAlign: 'center',
  },
  numberError: {
    color: Colors.danger,
    fontSize: 13,
  },
  hostStatus: {
    color: Colors.live,
    fontSize: 13,
    fontWeight: '600',
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(45, 212, 191, 0.12)',
  },
  cardIconHighlight: {
    backgroundColor: 'rgba(11, 15, 20, 0.12)',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  cardTitleHighlight: {
    color: Colors.background,
  },
  cardSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  cardSubtitleHighlight: {
    color: 'rgba(11, 15, 20, 0.7)',
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  footerToggle: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  footerDetails: {
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  footerLink: {
    marginTop: Spacing.sm,
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
