import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/useTheme';

interface Props {
  emoji: string;
  title: string;
  description: string;
}

export default function EmptyState({ emoji, title, description }: Props) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[typography.title3, { color: colors.textPrimary, marginBottom: spacing.sm }]}>
        {title}
      </Text>
      <Text style={[typography.subheadline, { color: colors.textSecondary, textAlign: 'center', maxWidth: 260 }]}>
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
    opacity: 0.5,
  },
});
