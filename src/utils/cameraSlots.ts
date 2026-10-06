import { File, Paths } from 'expo-file-system';

/** Fixed camera numbers viewers enter (1–10). */
export const FIXED_CAMERA_COUNT = 10;

export const CAMERA_SLOTS = Array.from({ length: FIXED_CAMERA_COUNT }, (_, i) => i + 1);

export function isValidCameraSlot(value: string | number): boolean {
  const n = Number(String(value).trim());
  return Number.isInteger(n) && n >= 1 && n <= FIXED_CAMERA_COUNT;
}

export function normalizeCameraCode(value: string): string | null {
  const raw = value.trim();
  if (!isValidCameraSlot(raw)) return null;
  return String(Number(raw));
}

function savedSlotFile() {
  return new File(Paths.document, 'camera-slot.txt');
}

/** Camera number this phone streams on by default, or null if never set. */
export function loadSavedCameraSlot(): number | null {
  try {
    const file = savedSlotFile();
    if (!file.exists) return null;
    const value = file.textSync().trim();
    return isValidCameraSlot(value) ? Number(value) : null;
  } catch {
    return null;
  }
}

export function saveCameraSlot(slot: number) {
  if (!isValidCameraSlot(slot)) return;
  try {
    const file = savedSlotFile();
    if (!file.exists) file.create();
    file.write(String(slot));
  } catch (e) {
    console.warn('Failed to save camera number', e);
  }
}

export function clearSavedCameraSlot() {
  try {
    const file = savedSlotFile();
    if (file.exists) file.delete();
  } catch {
    // ignore
  }
}
