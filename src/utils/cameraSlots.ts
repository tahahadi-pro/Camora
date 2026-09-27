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
