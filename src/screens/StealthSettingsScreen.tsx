/**
 * Stealth mode settings: enable with a secret PIN, toggle biometric unlock,
 * change the PIN, or turn stealth off. Reached from the Home screen.
 */
import { Colors, Spacing } from '@/constants/theme';
import {
  disableStealth,
  isBiometricPreferredSync,
  isStealthEnabledSync,
  setBiometricPreference,
  setStealthPin,
  verifyPin,
} from '@/services/stealth';
import { useStealthLock } from '@/services/stealthLock';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PIN_MIN = 4;
const PIN_MAX = 8;

function onlyDigits(text: string): string {
  return text.replace(/[^0-9]/g, '').slice(0, PIN_MAX);
}

export default function StealthSettingsScreen() {
  const { refresh } = useStealthLock();
  const [enabled, setEnabled] = useState(isStealthEnabledSync);
  const [biometricPref, setBiometricPref] = useState(isBiometricPreferredSync);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      setBiometricAvailable(hasHardware && isEnrolled);
    })();
  }, []);

  const clearMessages = () => {
    setError(null);
    setNotice(null);
  };

  const resetInputs = () => {
    setPin('');
    setConfirm('');
    setCurrentPin('');
  };

  const onEnable = async () => {
    clearMessages();
    if (pin.length < PIN_MIN) {
      setError(`PIN must be at least ${PIN_MIN} digits.`);
      return;
    }
    if (pin !== confirm) {
      setError('PINs do not match.');
      return;
    }
    setBusy(true);
    try {
      await setStealthPin(pin);
      setEnabled(true);
      refresh();
      resetInputs();
      setNotice('Stealth mode is on. Open the calculator and type your PIN, then "=" to unlock.');
    } catch {
      setError('Could not save your PIN. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onChangePin = async () => {
    clearMessages();
    if (pin.length < PIN_MIN) {
      setError(`New PIN must be at least ${PIN_MIN} digits.`);
      return;
    }
    if (pin !== confirm) {
      setError('New PINs do not match.');
      return;
    }
    setBusy(true);
    try {
      if (!(await verifyPin(currentPin))) {
        setError('Current PIN is incorrect.');
        return;
      }
      await setStealthPin(pin);
      resetInputs();
      setNotice('PIN updated.');
    } catch {
      setError('Could not update your PIN. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    clearMessages();
    setBusy(true);
    try {
      if (!(await verifyPin(currentPin))) {
        setError('Current PIN is incorrect.');
        return;
      }
      await disableStealth();
      setEnabled(false);
      setBiometricPref(false);
      refresh();
      resetInputs();
      setNotice('Stealth mode turned off.');
    } catch {
      setError('Could not turn off stealth mode. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onToggleBiometric = async (next: boolean) => {
    clearMessages();
    try {
      await setBiometricPreference(next);
      setBiometricPref(next);
    } catch {
      setError('Could not change biometric setting.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Stealth Mode</Text>
        </View>

        <Text style={styles.intro}>
          When on, Camora opens as a calculator. Type your secret PIN and press “=” to reveal the
          real app. Content is also hidden from screenshots and the app switcher.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {!enabled ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Set up stealth mode</Text>
            <Text style={styles.label}>Secret PIN ({PIN_MIN}–{PIN_MAX} digits)</Text>
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={(t) => setPin(onlyDigits(t))}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="••••"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.label}>Confirm PIN</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={(t) => setConfirm(onlyDigits(t))}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="••••"
              placeholderTextColor={Colors.textMuted}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onEnable}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, busy && styles.disabled]}>
              <Text style={styles.primaryBtnText}>Turn on stealth mode</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.cardTitle}>Biometric unlock</Text>
                  <Text style={styles.label}>
                    {biometricAvailable
                      ? 'Long-press the calculator display to unlock with Face ID / fingerprint.'
                      : 'No biometrics enrolled on this device.'}
                  </Text>
                </View>
                <Switch
                  value={biometricPref}
                  disabled={!biometricAvailable}
                  onValueChange={onToggleBiometric}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Change PIN</Text>
              <Text style={styles.label}>Current PIN</Text>
              <TextInput
                style={styles.input}
                value={currentPin}
                onChangeText={(t) => setCurrentPin(onlyDigits(t))}
                keyboardType="number-pad"
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={Colors.textMuted}
              />
              <Text style={styles.label}>New PIN</Text>
              <TextInput
                style={styles.input}
                value={pin}
                onChangeText={(t) => setPin(onlyDigits(t))}
                keyboardType="number-pad"
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={Colors.textMuted}
              />
              <Text style={styles.label}>Confirm new PIN</Text>
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={(t) => setConfirm(onlyDigits(t))}
                keyboardType="number-pad"
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={Colors.textMuted}
              />
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onChangePin}
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, busy && styles.disabled]}>
                <Text style={styles.primaryBtnText}>Update PIN</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Turn off stealth mode</Text>
              <Text style={styles.label}>Enter your current PIN to confirm</Text>
              <TextInput
                style={styles.input}
                value={currentPin}
                onChangeText={(t) => setCurrentPin(onlyDigits(t))}
                keyboardType="number-pad"
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={Colors.textMuted}
              />
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onDisable}
                style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed, busy && styles.disabled]}>
                <Text style={styles.dangerBtnText}>Turn off stealth mode</Text>
              </Pressable>
            </View>
          </>
        )}
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
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  header: {
    gap: Spacing.sm,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
  },
  backText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  intro: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  notice: {
    color: Colors.live,
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  label: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '800',
  },
  dangerBtn: {
    marginTop: Spacing.xs,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.danger,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  dangerBtnText: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
});
