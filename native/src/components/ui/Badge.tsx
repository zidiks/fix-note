import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/useTheme';

interface Props {
  type: 'voice' | 'text' | 'photo';
  label: string;
}

export default function Badge({ type, label }: Props) {
  const { colors } = useTheme();

  const colorMap = {
    voice: { bg: 'rgba(0, 122, 255, 0.12)', text: colors.accent },
    text: { bg: 'rgba(52, 199, 89, 0.12)', text: colors.success },
    photo: { bg: 'rgba(255, 149, 0, 0.12)', text: colors.warning },
  };

  const c = colorMap[type];

  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
