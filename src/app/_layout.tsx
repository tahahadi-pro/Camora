import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Colors } from '@/constants/theme';
import LockScreen from '@/screens/LockScreen';
import { resumeSavedCameraHost } from '@/services/cameraHost';
import { StealthLockProvider, useStealthLock } from '@/services/stealthLock';
import { getWebRtcNative } from '@/services/webrtc/native';

SplashScreen.preventAutoHideAsync();

// Best-effort: no-ops in Expo Go so the app can still boot and show instructions.
getWebRtcNative();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
    void resumeSavedCameraHost().catch((e) => console.warn('Camera auto-start failed', e));
  }, []);

  return (
    <StealthLockProvider>
      <StatusBar style="light" />
      <RootContent />
    </StealthLockProvider>
  );
}

function RootContent() {
  const { locked } = useStealthLock();

  return (
    <>
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
        <Stack.Screen name="stealth" />
      </Stack>
      {locked ? <LockScreen /> : null}
    </>
  );
}
