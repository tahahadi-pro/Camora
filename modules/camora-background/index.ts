import { requireOptionalNativeModule } from 'expo';

type CamoraBackgroundModule = {
  isRunning(): boolean;
  start(title: string, body: string): Promise<void>;
  update(title: string, body: string): Promise<void>;
  stop(): Promise<void>;
  setAutoStartEnabled(enabled: boolean): void;
  canAutoStart(): boolean;
  consumeBackgroundLaunch(): boolean;
  openAutoStartSettings(): Promise<void>;
  moveToBackground(): Promise<void>;
  startKeepAlive(): Promise<void>;
  stopKeepAlive(): Promise<void>;
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): Promise<void>;
};

/** Headless task key the native keep-alive starts; must be registered with AppRegistry. */
export const KEEP_ALIVE_TASK = 'CamoraKeepAlive';

/** Android-only foreground service; null on iOS, web and Expo Go. */
const native = requireOptionalNativeModule<CamoraBackgroundModule>('CamoraBackground');

export function isBackgroundServiceSupported() {
  return native != null;
}

export async function startBackgroundService(title: string, body: string) {
  await native?.start(title, body);
}

export async function updateBackgroundService(title: string, body: string) {
  await native?.update(title, body);
}

export async function stopBackgroundService() {
  await native?.stop();
}

/** Lets Camora re-open itself after a reboot while a camera number is saved. */
export function setAutoStartEnabled(enabled: boolean) {
  native?.setAutoStartEnabled(enabled);
}

/** Whether Android lets Camora open itself from the background ("Display over other apps"). */
export function canAutoStart() {
  return native?.canAutoStart() ?? true;
}

/** True once when this launch was an automatic one (e.g. after reboot). */
export function consumeBackgroundLaunch() {
  return native?.consumeBackgroundLaunch() ?? false;
}

export async function openAutoStartSettings() {
  await native?.openAutoStartSettings();
}

export async function moveAppToBackground() {
  await native?.moveToBackground();
}

/** Keeps JS timers (socket reconnects, retries) running while the app is in the background. */
export async function startKeepAlive() {
  await native?.startKeepAlive();
}

export async function stopKeepAlive() {
  await native?.stopKeepAlive();
}

export function isIgnoringBatteryOptimizations() {
  return native?.isIgnoringBatteryOptimizations() ?? true;
}

export async function requestIgnoreBatteryOptimizations() {
  await native?.requestIgnoreBatteryOptimizations();
}
