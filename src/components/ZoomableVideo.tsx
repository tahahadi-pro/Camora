import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { CamoraRTCView } from '@/components/CamoraRTCView';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

type Props = {
  streamURL: string;
  objectFit: 'contain' | 'cover';
  onTap?: () => void;
};

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

function maxOffset(size: number, scale: number) {
  'worklet';
  return (size * (scale - 1)) / 2;
}

/**
 * Pinch / pan / double-tap zoom for the live video. RTCView is a SurfaceView on Android, which
 * ignores scale transforms, so zoom enlarges the view's layout instead. It must sit in a
 * full-screen container, because a SurfaceView is not clipped by its parent.
 */
export function ZoomableVideo({ streamURL, objectFit, onTap }: Props) {
  const [measured, setMeasured] = useState(false);
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
    height.value = e.nativeEvent.layout.height;
    // Rotation changes the box, so start over instead of keeping a stale pan offset.
    scale.value = 1;
    offsetX.value = 0;
    offsetY.value = 0;
    setMeasured(true);
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = clamp(startScale.value * e.scale, 1, MAX_SCALE);
      scale.value = next;
      offsetX.value = clamp(offsetX.value, -maxOffset(width.value, next), maxOffset(width.value, next));
      offsetY.value = clamp(offsetY.value, -maxOffset(height.value, next), maxOffset(height.value, next));
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      startX.value = offsetX.value;
      startY.value = offsetY.value;
    })
    .onUpdate((e) => {
      const limitX = maxOffset(width.value, scale.value);
      const limitY = maxOffset(height.value, scale.value);
      offsetX.value = clamp(startX.value + e.translationX, -limitX, limitX);
      offsetY.value = clamp(startY.value + e.translationY, -limitY, limitY);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomIn = scale.value <= 1.05;
      scale.value = withTiming(zoomIn ? DOUBLE_TAP_SCALE : 1);
      offsetX.value = withTiming(0);
      offsetY.value = withTiming(0);
    });

  const singleTap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => onTap?.());

  const gesture = Gesture.Simultaneous(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const videoStyle = useAnimatedStyle(() => {
    const w = width.value * scale.value;
    const h = height.value * scale.value;
    return {
      width: w,
      height: h,
      left: (width.value - w) / 2 + offsetX.value,
      top: (height.value - h) / 2 + offsetY.value,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.fill} onLayout={onLayout} collapsable={false}>
        {measured ? (
          <Animated.View style={[styles.video, videoStyle]} pointerEvents="none">
            <CamoraRTCView streamURL={streamURL} style={styles.fill} objectFit={objectFit} />
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    position: 'absolute',
  },
});
