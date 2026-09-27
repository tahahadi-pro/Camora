import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Colors } from '@/constants/theme';
import { getWebRtcNative } from '@/services/webrtc/native';

SplashScreen.preventAutoHideAsync();

// Best-effort: no-ops in Expo Go so the app can still boot and show instructions.
getWebRtcNative();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: 'fade',
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="camera" />
        <Stack.Screen name="viewer" />
        <Stack.Screen name="scan" />
      </Stack>
    </>
  );
}
