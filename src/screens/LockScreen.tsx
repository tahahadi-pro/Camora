/**
 * Decoy lock screen. To anyone who opens Camora while stealth mode is on, this
 * looks and behaves like an ordinary calculator. The real app is revealed only
 * by typing the secret PIN and pressing "=", or by a long-press on the display
 * when biometric unlock is enabled.
 */
import { isBiometricPreferredSync, verifyPin } from '@/services/stealth';
import { useStealthLock } from '@/services/stealthLock';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Op = '+' | '-' | '×' | '÷';

function compute(a: number, b: number, op: Op): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? NaN : a / b;
  }
}

function formatResult(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  // Trim floating point noise while keeping a normal calculator feel.
  return String(Math.round(n * 1e10) / 1e10);
}

export default function LockScreen() {
  const { unlock } = useStealthLock();
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [usedOperator, setUsedOperator] = useState(false);

  const reset = useCallback(() => {
    setDisplay('0');
    setAcc(null);
    setOp(null);
    setWaiting(false);
    setUsedOperator(false);
  }, []);

  const inputDigit = (d: string) => {
    if (waiting) {
      setDisplay(d);
      setWaiting(false);
    } else {
      setDisplay((prev) => (prev === '0' ? d : prev + d));
    }
  };

  const inputDot = () => {
    if (waiting) {
      setDisplay('0.');
      setWaiting(false);
      return;
    }
    setDisplay((prev) => (prev.includes('.') ? prev : prev + '.'));
  };

  const inputOp = (nextOp: Op) => {
    const current = parseFloat(display);
    if (acc != null && op && !waiting) {
      const result = compute(acc, current, op);
      setAcc(result);
      setDisplay(formatResult(result));
    } else {
      setAcc(current);
    }
    setOp(nextOp);
    setWaiting(true);
    setUsedOperator(true);
  };

  const onEquals = useCallback(async () => {
    // Secret path: a bare number that matches the PIN unlocks the real app.
    if (!usedOperator && /^\d+$/.test(display)) {
      if (await verifyPin(display)) {
        reset();
        unlock();
        return;
      }
    }
    if (acc != null && op) {
      const result = compute(acc, parseFloat(display), op);
      setDisplay(formatResult(result));
      setAcc(null);
      setOp(null);
      setWaiting(true);
      setUsedOperator(false);
    }
  }, [acc, display, op, usedOperator, reset, unlock]);

  const tryBiometric = useCallback(async () => {
    if (!isBiometricPreferredSync()) return;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) return;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Camora',
        cancelLabel: 'Cancel',
      });
      if (result.success) {
        reset();
        unlock();
      }
    } catch {
      // Stay on the decoy; never reveal that a lock exists.
    }
  }, [reset, unlock]);

  const toggleSign = () => {
    setDisplay((prev) => (prev.startsWith('-') ? prev.slice(1) : prev === '0' ? prev : '-' + prev));
  };

  const percent = () => {
    setDisplay((prev) => formatResult(parseFloat(prev) / 100));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable
        style={styles.displayWrap}
        onLongPress={tryBiometric}
        delayLongPress={600}
        accessibilityRole="text">
        <Text style={styles.display} numberOfLines={1} adjustsFontSizeToFit>
          {display}
        </Text>
      </Pressable>

      <View style={styles.pad}>
        <View style={styles.row}>
          <CalcButton label="AC" variant="function" onPress={reset} />
          <CalcButton label="+/−" variant="function" onPress={toggleSign} />
          <CalcButton label="%" variant="function" onPress={percent} />
          <CalcButton label="÷" variant="operator" onPress={() => inputOp('÷')} />
        </View>
        <View style={styles.row}>
          <CalcButton label="7" onPress={() => inputDigit('7')} />
          <CalcButton label="8" onPress={() => inputDigit('8')} />
          <CalcButton label="9" onPress={() => inputDigit('9')} />
          <CalcButton label="×" variant="operator" onPress={() => inputOp('×')} />
        </View>
        <View style={styles.row}>
          <CalcButton label="4" onPress={() => inputDigit('4')} />
          <CalcButton label="5" onPress={() => inputDigit('5')} />
          <CalcButton label="6" onPress={() => inputDigit('6')} />
          <CalcButton label="−" variant="operator" onPress={() => inputOp('-')} />
        </View>
        <View style={styles.row}>
          <CalcButton label="1" onPress={() => inputDigit('1')} />
          <CalcButton label="2" onPress={() => inputDigit('2')} />
          <CalcButton label="3" onPress={() => inputDigit('3')} />
          <CalcButton label="+" variant="operator" onPress={() => inputOp('+')} />
        </View>
        <View style={styles.row}>
          <CalcButton label="0" wide onPress={() => inputDigit('0')} />
          <CalcButton label="." onPress={inputDot} />
          <CalcButton label="=" variant="operator" onPress={onEquals} />
        </View>
      </View>
    </SafeAreaView>
  );
}

type CalcButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'digit' | 'operator' | 'function';
  wide?: boolean;
};

function CalcButton({ label, onPress, variant = 'digit', wide }: CalcButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        wide && styles.keyWide,
        variant === 'operator' && styles.keyOperator,
        variant === 'function' && styles.keyFunction,
        pressed && styles.keyPressed,
      ]}>
      <Text
        style={[
          styles.keyText,
          variant === 'operator' && styles.keyTextOperator,
          variant === 'function' && styles.keyTextFunction,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const GAP = 12;

const styles = StyleSheet.create({
  safe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 1000,
  },
  displayWrap: {
    paddingHorizontal: 28,
    paddingBottom: 24,
    alignItems: 'flex-end',
  },
  display: {
    color: '#FFFFFF',
    fontSize: 80,
    fontWeight: '300',
  },
  pad: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  key: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyWide: {
    flex: 2.15,
    aspectRatio: undefined,
    alignItems: 'flex-start',
    paddingLeft: 32,
  },
  keyOperator: {
    backgroundColor: '#FF9F0A',
  },
  keyFunction: {
    backgroundColor: '#A5A5A5',
  },
  keyPressed: {
    opacity: 0.7,
  },
  keyText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '500',
  },
  keyTextOperator: {
    color: '#FFFFFF',
  },
  keyTextFunction: {
    color: '#000000',
  },
});
