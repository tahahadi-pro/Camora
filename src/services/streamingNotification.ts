import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'camora-streaming';
const NOTIFICATION_ID = 'camora-streaming-active';

Notifications.setNotificationHandler({
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
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'CCTV Streaming',
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: [0],
    lightColor: '#22C55E',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function showStreamingNotification() {
  await ensureStreamingChannel();

  if (Platform.OS === 'android') {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  }

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
  await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
}

export function addStopStreamingListener(onStop: () => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const action = response.actionIdentifier;
    if (action === 'STOP_STREAMING' || action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      // User tapped the notification — treat as awareness; Stop is explicit via app UI.
      if (action === 'STOP_STREAMING') onStop();
    }
  });
}
