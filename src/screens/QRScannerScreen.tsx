import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ControlButton } from '@/components/ControlButton';
import { Colors, Spacing } from '@/constants/theme';
import { parseConnectionPayload } from '@/utils/connectionPayload';

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.text}>Checking camera permission…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.text}>Camera access is required to scan QR codes.</Text>
          <ControlButton label="Grant permission" onPress={() => void requestPermission()} />
          <ControlButton label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <ControlButton label="← Back" variant="ghost" onPress={() => router.back()} />
        <Text style={styles.title}>Scan QR Code</Text>
      </View>

      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={
            scanned
              ? undefined
              : ({ data }) => {
                  setScanned(true);
                  const parsed = parseConnectionPayload(data);
                  if (!parsed?.roomCode) {
                    setError('QR code is not a valid Camora connection.');
                    setScanned(false);
                    return;
                  }
                  router.replace({
                    pathname: '/viewer',
                    params: {
                      code: parsed.roomCode,
                      token: parsed.sessionToken,
                      payload: data,
                    },
                  });
                }
          }
        />
        <View style={styles.frame} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>Point at the QR code shown on the camera phone.</Text>
      {scanned && (
        <ControlButton
          label="Scan again"
          onPress={() => {
            setScanned(false);
            setError(null);
          }}
          style={{ margin: Spacing.lg }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    paddingHorizontal: Spacing.sm,
  },
  cameraWrap: {
    flex: 1,
    margin: Spacing.lg,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  frame: {
    position: 'absolute',
    top: '25%',
    left: '15%',
    right: '15%',
    bottom: '25%',
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 16,
  },
  text: {
    color: Colors.text,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  hint: {
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  error: {
    color: Colors.danger,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
});
