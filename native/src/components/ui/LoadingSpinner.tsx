import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/useTheme';

interface Props {
  size?: 'small' | 'large';
  fullScreen?: boolean;
}

export default function LoadingSpinner({ size = 'large', fullScreen = false }: Props) {
  const { colors } = useTheme();
  if (fullScreen) {
    return (
      <View style={[styles.fullScreen, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size={size} color={colors.accent} />
      </View>
    );
  }
  return <ActivityIndicator size={size} color={colors.accent} />;
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
