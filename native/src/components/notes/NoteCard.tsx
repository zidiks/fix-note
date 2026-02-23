import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Note } from '../../api/types';
import { useTheme } from '../../theme/useTheme';
import { formatDuration } from '../../utils/date';
import Badge from '../ui/Badge';

interface Props {
  note: Note;
  onPress: (note: Note) => void;
  isLast?: boolean;
}

export default function NoteCard({ note, onPress, isLast = false }: Props) {
  const { colors, typography, spacing } = useTheme();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(note);
  };

  const getPreviewText = () => {
    return note.summary || note.content || '';
  };

  const preview = getPreviewText();
  const lines = preview.split('\n').filter(Boolean).slice(0, 3).join(' ');
  const truncated = lines.length > 120 ? lines.slice(0, 120) + '…' : lines;

  const badgeType = note.source as 'voice' | 'text' | 'photo';
  const badgeLabel = note.source === 'voice' ? '🎙️ Голос' : note.source === 'photo' ? '📷 Фото' : '✏️ Текст';

  const noteDate = new Date(note.created_at);
  const timeStr = noteDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={[styles.card, { backgroundColor: colors.bgSecondary }]}
    >
      {/* Title row */}
      <View style={styles.header}>
        <Text
          style={[typography.headline, { color: colors.textPrimary, flex: 1 }]}
          numberOfLines={1}
        >
          {note.title || truncated.slice(0, 40) || 'Без названия'}
        </Text>
        <Text style={[typography.caption1, { color: colors.textTertiary }]}>{timeStr}</Text>
      </View>

      {/* Preview text */}
      {truncated ? (
        <Text
          style={[typography.subheadline, { color: colors.textSecondary, marginTop: 4 }]}
          numberOfLines={2}
        >
          {truncated}
        </Text>
      ) : null}

      {/* Footer: badge + duration */}
      <View style={[styles.footer, { marginTop: spacing.sm }]}>
        <Badge type={badgeType} label={badgeLabel} />
        {note.source === 'voice' && note.duration_seconds ? (
          <Text style={[typography.caption1, { color: colors.textTertiary }]}>
            {formatDuration(note.duration_seconds)}
          </Text>
        ) : null}
        {note.images && note.images.length > 0 ? (
          <Text style={[typography.caption1, { color: colors.textTertiary }]}>
            {note.images.length} фото
          </Text>
        ) : null}
      </View>

      {/* Separator */}
      {!isLast && (
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  separator: {
    height: 0.5,
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 0,
  },
});
