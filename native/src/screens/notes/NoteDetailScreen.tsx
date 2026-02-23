import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { NotesStackParamList } from '../../navigation/types';
import { useNote, useDeleteNote, useUpdateNote } from '../../hooks/useNotes';
import { useTheme } from '../../theme/useTheme';
import { useI18n } from '../../i18n';
import { formatNoteDate, formatDuration } from '../../utils/date';
import Badge from '../../components/ui/Badge';
import VoicePlayer from '../../components/voice/VoicePlayer';
import { notesApi } from '../../api/notes';

type Props = {
  navigation: NativeStackNavigationProp<NotesStackParamList, 'NoteDetail'>;
  route: RouteProp<NotesStackParamList, 'NoteDetail'>;
};

type Tab = 'summary' | 'content';

export default function NoteDetailScreen({ navigation, route }: Props) {
  const { noteId } = route.params;
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();

  const { data: note, isLoading } = useNote(noteId);
  const deleteNote = useDeleteNote();
  const updateNote = useUpdateNote(noteId);

  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t('delete'),
      'Удалить эту заметку?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteNote.mutateAsync(noteId);
            navigation.goBack();
          },
        },
      ]
    );
  }, [noteId, deleteNote, navigation, t]);

  const handleShare = useCallback(async () => {
    if (!note) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const shareResponse = await notesApi.createShareLink(noteId, true);
      await Share.share({
        message: shareResponse.share_url,
        url: shareResponse.share_url,
      });
    } catch {
      Alert.alert(t('error'), t('operationFailed'));
    }
  }, [note, noteId, t]);

  if (isLoading || !note) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const hasSummary = !!note.summary;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.accent }]}>← {t('back')}</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShare} style={styles.actionBtn}>
            <Text style={{ color: colors.accent, fontSize: 17 }}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.actionBtn}>
            <Text style={{ color: colors.destructive, fontSize: 17 }}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        {note.title ? (
          <Text style={[typography.title2, { color: colors.textPrimary, marginBottom: spacing.sm }]}>
            {note.title}
          </Text>
        ) : null}

        {/* Meta */}
        <View style={styles.meta}>
          <Badge
            type={note.source as 'voice' | 'text' | 'photo'}
            label={note.source === 'voice' ? '🎙️ Голос' : note.source === 'photo' ? '📷 Фото' : '✏️ Текст'}
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

        {/* Voice Player */}
        {note.voice_url ? (
          <View style={{ marginVertical: spacing.base }}>
            <VoicePlayer uri={note.voice_url} />
          </View>
        ) : null}

        {/* Tabs: Summary / Full Text */}
        {hasSummary ? (
          <View style={[styles.tabs, { backgroundColor: colors.bgSecondary, borderColor: colors.separator }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'summary' && [styles.activeTab, { backgroundColor: colors.accent }]]}
              onPress={() => setActiveTab('summary')}
            >
              <Text style={[styles.tabText, { color: activeTab === 'summary' ? '#fff' : colors.textSecondary }]}>
                {t('tabAiSummary')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'content' && [styles.activeTab, { backgroundColor: colors.accent }]]}
              onPress={() => setActiveTab('content')}
            >
              <Text style={[styles.tabText, { color: activeTab === 'content' ? '#fff' : colors.textSecondary }]}>
                {t('tabFullText')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Content */}
        <View style={{ marginTop: spacing.base }}>
          {hasSummary && activeTab === 'summary' ? (
            <Text style={[typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>
              {note.summary}
            </Text>
          ) : (
            <Text style={[typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>
              {note.content}
            </Text>
          )}
        </View>
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
  backButton: { padding: 4 },
  backText: { fontSize: 17 },
  headerActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 8 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    borderWidth: 0.5,
    marginTop: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {},
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
