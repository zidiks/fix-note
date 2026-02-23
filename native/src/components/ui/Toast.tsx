import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  visible: boolean;
  duration?: number;
  onHide?: () => void;
}

export function Toast({
  message,
  type = 'info',
  visible,
  duration = 2500,
  onHide,
}: ToastProps) {
  const { colors, typography } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(duration),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onHide?.());
  }, [visible, duration]);

  if (!visible) return null;

  const bgColor =
    type === 'success'
      ? colors.success
      : type === 'error'
      ? colors.destructive
      : colors.accent;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={[styles.pill, { backgroundColor: bgColor }]}>
        <Text style={[typography.subheadline, styles.text]}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'none',
  },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    maxWidth: '80%',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
});

// ── Simple imperative hook ──────────────────────────────────────────────────

interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
}

export function useToast() {
  const [toast, setToast] = React.useState<ToastState>({
    message: '',
    type: 'info',
    visible: false,
  });

  const show = React.useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type, visible: true });
  }, []);

  const hide = React.useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const toastElement = (
    <Toast
      message={toast.message}
      type={toast.type}
      visible={toast.visible}
      onHide={hide}
    />
  );

  return { show, hide, toastElement };
}
