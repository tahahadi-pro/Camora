import { Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
    // The app allows rotation only so the viewer can go landscape in fullscreen.
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    void resumeSavedCameraHost().catch((e) => console.warn('Camera auto-start failed', e));
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StealthLockProvider>
        <StatusBar style="light" />
        <RootContent />
      </StealthLockProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

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
