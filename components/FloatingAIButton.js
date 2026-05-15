import React, { useRef, useEffect } from 'react';
import { Animated, PanResponder, View, Dimensions, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/ThemeContext';
import { useAuth } from '../services/AuthContext';

const BUTTON_SIZE = 56;
const EDGE_MARGIN = 16;
const TAP_THRESHOLD = 8;

const FloatingAIButton = ({ navigation }) => {
  const { theme } = useTheme();
  const { selectedDeviceId } = useAuth();

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  const pan = useRef(new Animated.ValueXY({
    x: screenWidth - BUTTON_SIZE - EDGE_MARGIN,
    y: screenHeight - BUTTON_SIZE - EDGE_MARGIN - 90,
  })).current;

  const isDragging = useRef(false);

  // Keep a ref so panResponder callbacks always read the latest value
  const deviceIdRef = useRef(selectedDeviceId);
  useEffect(() => { deviceIdRef.current = selectedDeviceId; }, [selectedDeviceId]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: () => {
        isDragging.current = false;
        pan.setOffset({ x: pan.x._value, y: pan.y._value });
        pan.setValue({ x: 0, y: 0 });
      },

      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > TAP_THRESHOLD || Math.abs(gesture.dy) > TAP_THRESHOLD) {
          isDragging.current = true;
        }
        Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(_, gesture);
      },

      onPanResponderRelease: (_, gesture) => {
        pan.flattenOffset();

        if (!isDragging.current) {
          const devId = deviceIdRef.current;
          if (devId) navigation.navigate('AskAI', { deviceId: devId });
          return;
        }

        const { width: w, height: h } = Dimensions.get('window');
        const snapX = pan.x._value + BUTTON_SIZE / 2 < w / 2
          ? EDGE_MARGIN
          : w - BUTTON_SIZE - EDGE_MARGIN;

        const snapY = Math.max(
          EDGE_MARGIN + 60,
          Math.min(pan.y._value, h - BUTTON_SIZE - EDGE_MARGIN - 90),
        );

        Animated.spring(pan, {
          toValue: { x: snapX, y: snapY },
          useNativeDriver: false,
          friction: 7,
          tension: 40,
        }).start();
      },
    }),
  ).current;

  if (!selectedDeviceId) return null;

  return (
    <Animated.View
      style={[styles.container, { left: pan.x, top: pan.y }]}
      {...panResponder.panHandlers}
    >
      <View style={[styles.button, { backgroundColor: theme.primary, shadowColor: theme.primary }]}>
        <Ionicons name="sparkles" size={24} color="#fff" />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex:   999,
  },
  button: {
    width:          BUTTON_SIZE,
    height:         BUTTON_SIZE,
    borderRadius:   BUTTON_SIZE / 2,
    alignItems:     'center',
    justifyContent: 'center',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.4,
    shadowRadius:   8,
    elevation:      8,
  },
});

export default FloatingAIButton;
