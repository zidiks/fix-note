import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/types';
import { useSharedNote } from '../../hooks/useNotes';
import { useTheme } from '../../theme/useTheme';
import { useI18n } from '../../i18n';
import { formatNoteDate, formatDuration } from '../../utils/date';
import Badge from '../../components/ui/Badge';
import VoicePlayer from '../../components/voice/VoicePlayer';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'SharedNote'>;
  route: RouteProp<RootStackParamList, 'SharedNote'>;
};

export default function SharedNoteScreen({ navigation, route }: Props) {
  const { token } = route.params;
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();

  const { data, isLoading, isError } = useSharedNote(token);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={[styles.header, { borderBottomColor: colors.separator }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[styles.closeText, { color: colors.accent }]}>Закрыть</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            Заметка не найдена или доступ закрыт
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { note } = data;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <View style={{ width: 60 }} />
        <Text style={[typography.headline, { color: colors.textPrimary }]}>Поделились заметкой</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 60, alignItems: 'flex-end' }}>
          <Text style={[styles.closeText, { color: colors.accent }]}>Закрыть</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {note.title ? (
          <Text style={[typography.title2, { color: colors.textPrimary, marginBottom: spacing.sm }]}>
            {note.title}
          </Text>
        ) : null}

        <View style={styles.meta}>
          <Badge
            type={note.source as 'voice' | 'text' | 'photo'}
            label={note.source === 'voice' ? '🎙️ Голос' : '✏️ Текст'}
          />
          <Text style={[typography.caption1, { color: colors.textTertiary }]}>
            {formatNoteDate(note.created_at)}
          </Text>
          {note.source === 'voice' && note.duration_seconds ? (
            <Text style={[typography.caption1, { color: colors.textTertiary }]}>
              {formatDuration(note.duration_seconds)}
            </Text>
          ) : null}
        </View>

        {note.voice_url ? (
          <View style={{ marginVertical: spacing.base }}>
            <VoicePlayer uri={note.voice_url} />
          </View>
        ) : null}

        {note.summary ? (
          <View style={[styles.summaryCard, { backgroundColor: colors.bgSecondary }]}>
            <Text style={[typography.footnote, { color: colors.accent, marginBottom: 8, fontWeight: '600' }]}>
              AI Summary
            </Text>
            <Text style={[typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>
              {note.summary}
            </Text>
          </View>
        ) : null}

        <Text style={[typography.body, { color: colors.textPrimary, lineHeight: 24, marginTop: spacing.base }]}>
          {note.content}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  closeText: { fontSize: 17 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
});
