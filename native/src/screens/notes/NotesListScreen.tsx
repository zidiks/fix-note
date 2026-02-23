import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  RefreshControl,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { NotesStackParamList } from '../../navigation/types';
import { useNotes, useSearchNotesFTS } from '../../hooks/useNotes';
import { useTheme } from '../../theme/useTheme';
import { useI18n } from '../../i18n';
import { groupNotesByDate } from '../../utils/date';
import NoteCard from '../../components/notes/NoteCard';
import SearchBar from '../../components/search/SearchBar';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import RecordButton from '../../components/voice/RecordButton';
import { Note } from '../../api/types';
import { useQueryClient } from '@tanstack/react-query';

type Props = {
  navigation: NativeStackNavigationProp<NotesStackParamList, 'NotesList'>;
};

export default function NotesListScreen({ navigation }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);

  const { data: notesData, isLoading, refetch } = useNotes();
  const { data: searchData, isLoading: isSearchLoading } = useSearchNotesFTS(
    isSearchMode ? searchQuery : ''
  );

  const sections = useMemo(() => {
    if (isSearchMode && searchQuery.trim()) {
      if (!searchData?.results.length) return [];
      return [{
        title: t('results'),
        data: searchData.results.map((r) => ({ ...r, user_id: '', updated_at: r.created_at })) as Note[],
      }];
    }
    if (!notesData?.notes) return [];
    return groupNotesByDate(notesData.notes, t);
  }, [notesData, searchData, isSearchMode, searchQuery, t]);

  const handleNotePress = useCallback((note: Note) => {
    navigation.navigate('NoteDetail', { noteId: note.id });
  }, [navigation]);

  const handleSearchFocus = () => setIsSearchMode(true);
  const handleSearchClear = () => {
    setSearchQuery('');
    if (!searchQuery) setIsSearchMode(false);
  };

  const handleVoiceNoteCreated = () => {
    qc.invalidateQueries({ queryKey: ['notes'] });
  };

  const renderSectionHeader = ({ section }: { section: { title: string } }) => (
    <View style={[styles.sectionHeader, { backgroundColor: colors.bgPrimary }]}>
      <Text style={[typography.title3, { color: colors.textPrimary }]}>{section.title}</Text>
    </View>
  );

  const renderItem = ({ item, index, section }: { item: Note; index: number; section: { data: Note[] } }) => (
    <NoteCard
      note={item}
      onPress={handleNotePress}
      isLast={index === section.data.length - 1}
    />
  );

  const renderEmpty = () => {
    if (isLoading || isSearchLoading) return null;
    if (isSearchMode && searchQuery.trim()) {
      return (
        <EmptyState
          emoji="🔍"
          title={t('searchNoResults')}
          description={t('searchNoResultsDesc')}
        />
      );
    }
    return (
      <EmptyState
        emoji="🎙️"
        title={t('noNotes')}
        description={t('noNotesDesc')}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <Text style={[typography.largeTitle, { color: colors.textPrimary }]}>
          {t('notes')}
        </Text>
        <TouchableOpacity
          onPress={() => navigation.getParent()?.navigate('ProfileTab')}
          style={styles.avatarButton}
        >
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Notes List */}
      {isLoading ? (
        <LoadingSpinner fullScreen />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[
            styles.listContent,
            sections.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.accent}
            />
          }
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom Bar: Search + Record */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.bottomBar, { paddingBottom: 12 }]}>
          <SearchBar
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              if (text.length > 0) setIsSearchMode(true);
            }}
            onClear={handleSearchClear}
            placeholder={t('searchPlaceholder')}
          />
          <RecordButton onNoteCreated={handleVoiceNoteCreated} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  avatarButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
  },
  listContent: {
    paddingBottom: 100,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
});
