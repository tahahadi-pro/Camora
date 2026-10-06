import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

const CHANNEL_ID = 'camora-streaming';
const NOTIFICATION_ID = 'camora-streaming-active';

// Expo Go on Android (SDK 53+) throws as soon as expo-notifications is imported.
const Notifications: NotificationsModule | null =
  Platform.OS === 'android' && isRunningInExpoGo()
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-notifications') as NotificationsModule);

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Persistent notification while the camera is explicitly streaming.
 * Full Android foreground-service camera capture requires a development build
 * with FOREGROUND_SERVICE_* permissions (configured in app.json).
 */
export async function ensureStreamingChannel() {
  if (!Notifications || Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'CCTV Streaming',
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: [0],
    lightColor: '#22C55E',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** Android 13+ hides foreground-service notifications until this is granted. */
export async function ensureNotificationPermission() {
  if (!Notifications || Platform.OS !== 'android') return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }
}

export async function showStreamingNotification() {
  if (!Notifications) return;

  await ensureStreamingChannel();
  await ensureNotificationPermission();

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: 'Camora',
      body: 'CCTV Camera is streaming',
      sticky: true,
      autoDismiss: false,
      data: { action: 'streaming' },
      ...(Platform.OS === 'android'
        ? {
            channelId: CHANNEL_ID,
            priority: Notifications.AndroidNotificationPriority.LOW,
          }
        : {}),
    },
    trigger: null,
  });
}

export async function hideStreamingNotification() {
  await Notifications?.dismissNotificationAsync(NOTIFICATION_ID);
}

export function addStopStreamingListener(onStop: () => void) {
  if (!Notifications) return { remove: () => {} };

  const { DEFAULT_ACTION_IDENTIFIER } = Notifications;
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const action = response.actionIdentifier;
    if (action === 'STOP_STREAMING' || action === DEFAULT_ACTION_IDENTIFIER) {
      // User tapped the notification — treat as awareness; Stop is explicit via app UI.
      if (action === 'STOP_STREAMING') onStop();
    }
  });
}
