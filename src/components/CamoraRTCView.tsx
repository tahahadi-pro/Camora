import { ComponentType } from 'react';
import { StyleSheet, Text, View, ViewProps } from 'react-native';
import { Colors } from '@/constants/theme';
import { getWebRtcNative, isWebRtcAvailable } from '@/services/webrtc/native';

type RTCViewProps = ViewProps & {
  streamURL: string;
  objectFit?: 'contain' | 'cover';
  mirror?: boolean;
  zOrder?: number;
};

function MissingView({ style }: ViewProps) {
  return (
    <View style={[styles.missing, style]}>
      <Text style={styles.text}>WebRTC unavailable — use a development build.</Text>
    </View>
  );
}

/**
 * Dynamically resolves RTCView so Expo Go can load routes without crashing.
 */
export function CamoraRTCView(props: RTCViewProps) {
  if (!isWebRtcAvailable()) {
    return <MissingView style={props.style} />;
  }

  const mod = getWebRtcNative();
  const RTCView = mod?.RTCView as ComponentType<RTCViewProps> | undefined;
  if (!RTCView) {
    return <MissingView style={props.style} />;
  }

  return <RTCView {...props} />;
}

const styles = StyleSheet.create({
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: 16,
  },
  text: {
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
