/**
 * React context that drives Camora's stealth lock: whether the decoy/lock
 * screen is currently covering the app, and the native protections that hide
 * app content from screenshots and the app switcher.
 */
import * as ScreenCapture from 'expo-screen-capture';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { isStealthEnabledSync } from './stealth';

const SCREEN_CAPTURE_KEY = 'camora-stealth';

type StealthLockValue = {
  /** Whether stealth mode is turned on for this install. */
  enabled: boolean;
  /** Whether the lock/decoy screen should currently cover the app. */
  locked: boolean;
  /** Called by the lock screen after a correct PIN / biometric. */
  unlock: () => void;
  /** Re-read the enabled flag from storage (call after changing settings). */
  refresh: () => void;
};

const StealthLockContext = createContext<StealthLockValue | null>(null);

async function applyCaptureProtection() {
  try {
    await ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY);
    if (Platform.OS === 'ios') {
      await ScreenCapture.enableAppSwitcherProtectionAsync();
    }
  } catch (e) {
    console.warn('Stealth: failed to enable capture protection', e);
  }
}

async function removeCaptureProtection() {
  try {
    await ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY);
    if (Platform.OS === 'ios') {
      await ScreenCapture.disableAppSwitcherProtectionAsync();
    }
  } catch (e) {
    console.warn('Stealth: failed to disable capture protection', e);
  }
}

export function StealthLockProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(isStealthEnabledSync);
  // When enabled, the app always starts locked so nothing flashes before the PIN.
  const [locked, setLocked] = useState(enabled);
  const appState = useRef(AppState.currentState);

  const refresh = useCallback(() => {
    const next = isStealthEnabledSync();
    setEnabled(next);
    // Turning stealth off should also drop the lock; turning it on re-locks.
    setLocked(next);
  }, []);

  const unlock = useCallback(() => setLocked(false), []);

  // Apply or remove native screenshot / app-switcher protection with the flag.
  useEffect(() => {
    if (enabled) {
      void applyCaptureProtection();
      return () => {
        void removeCaptureProtection();
      };
    }
    return undefined;
  }, [enabled]);

  // Re-lock whenever the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (enabled && next.match(/inactive|background/) && prev === 'active') {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled]);

  const value = useMemo<StealthLockValue>(
    () => ({ enabled, locked, unlock, refresh }),
    [enabled, locked, unlock, refresh],
  );

  return <StealthLockContext.Provider value={value}>{children}</StealthLockContext.Provider>;
}

export function useStealthLock(): StealthLockValue {
  const ctx = useContext(StealthLockContext);
  if (!ctx) {
    throw new Error('useStealthLock must be used within a StealthLockProvider');
  }
  return ctx;
}
