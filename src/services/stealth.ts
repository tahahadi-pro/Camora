/**
 * Stealth mode: a PIN-gated lock that hides Camora behind a decoy screen and
 * blocks the app's content from app-switcher previews and screenshots.
 *
 * The PIN is never stored in plain text. We keep a random per-install salt and
 * a SHA-256 hash of `salt + pin` in the OS secure keystore (expo-secure-store).
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_ENABLED = 'camora.stealth.enabled';
const KEY_PIN_HASH = 'camora.stealth.pinHash';
const KEY_SALT = 'camora.stealth.salt';
const KEY_BIOMETRIC = 'camora.stealth.biometric';

const TRUE = '1';

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

/**
 * Synchronous read used by the lock gate on first paint so the decoy is shown
 * before any real content can flash on screen.
 */
export function isStealthEnabledSync(): boolean {
  try {
    return SecureStore.getItem(KEY_ENABLED) === TRUE;
  } catch {
    return false;
  }
}

export function isBiometricPreferredSync(): boolean {
  try {
    return SecureStore.getItem(KEY_BIOMETRIC) === TRUE;
  } catch {
    return false;
  }
}

/** Enable stealth mode (or change the PIN) with a freshly generated salt. */
export async function setStealthPin(pin: string): Promise<void> {
  const salt = Crypto.randomUUID();
  const pinHash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(KEY_SALT, salt);
  await SecureStore.setItemAsync(KEY_PIN_HASH, pinHash);
  await SecureStore.setItemAsync(KEY_ENABLED, TRUE);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const [salt, expected] = await Promise.all([
    SecureStore.getItemAsync(KEY_SALT),
    SecureStore.getItemAsync(KEY_PIN_HASH),
  ]);
  if (!salt || !expected) return false;
  const actual = await hashPin(pin, salt);
  return actual === expected;
}

/** Turn stealth mode off and wipe the stored PIN material. */
export async function disableStealth(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_ENABLED),
    SecureStore.deleteItemAsync(KEY_PIN_HASH),
    SecureStore.deleteItemAsync(KEY_SALT),
    SecureStore.deleteItemAsync(KEY_BIOMETRIC),
  ]);
}

export async function setBiometricPreference(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(KEY_BIOMETRIC, TRUE);
  } else {
    await SecureStore.deleteItemAsync(KEY_BIOMETRIC);
  }
}
