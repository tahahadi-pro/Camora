import { requireOptionalNativeModule } from 'expo';

type CamoraBackgroundModule = {
  isRunning(): boolean;
  start(title: string, body: string): Promise<void>;
  update(title: string, body: string): Promise<void>;
  stop(): Promise<void>;
};

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
