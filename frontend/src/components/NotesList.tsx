import { AnimatePresence } from 'framer-motion'
import { Note } from '../api/client'
import { useNotes, useSearchNotes } from '../hooks/useNotes'
import { useI18n } from '../i18n'
import { DateGroup } from './DateGroup'
import { NoteCard } from './NoteCard'
import { EmptyState } from './ui/EmptyState'

interface NotesListProps {
  searchQuery: string
  onSelectNote?: (note: Note) => void
}

export const NotesList = ({ searchQuery, onSelectNote }: NotesListProps) => {
  const { groupedNotes, isLoading } = useNotes()
  const { results: searchResults, isLoading: isSearching } = useSearchNotes(searchQuery)
  const { t } = useI18n()

  const isSearchMode = searchQuery.length >= 2
  const showLoading = isLoading || (isSearchMode && isSearching)

  // Loading state
  if (showLoading) {
    return (
      <div className="px-4 pt-4">
        <div className="mb-6">
          <div className="h-6 w-32 skeleton rounded mb-2" />
          <div className="rounded-xl overflow-hidden bg-[var(--bg-secondary)]">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4">
                <div className="h-5 skeleton w-3/4 mb-1.5" />
                <div className="h-4 skeleton w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Search results
  if (isSearchMode) {
    if (searchResults.length === 0) {
      return (
        <EmptyState
          icon="🔍"
          title={t('searchNoResults')}
          description={t('searchNoResultsDesc')}
        />
      )
    }

    return (
      <div className="pt-4">
        <h2 className="text-xl font-bold px-4 mb-2 text-[var(--text-primary)]">
          {t('results')} ({searchResults.length})
        </h2>

        <div className="mx-4 overflow-hidden rounded-xl bg-[var(--bg-secondary)]">
          <AnimatePresence mode="popLayout">
            {searchResults.map((result, index) => {
              const note: Note = {
                id: result.id,
                user_id: '',
                content: result.content,
                title: result.title ?? null,
                summary: result.summary,
                source: result.source || 'text',
                duration_seconds: result.duration_seconds,
                images: result.images || null,
                voice_url: result.voice_url || null,
                created_at: result.created_at,
                updated_at: result.created_at,
              }

              return (
                <NoteCard
                  key={result.id}
                  note={note}
                  onSelect={onSelectNote}
                  isFirst={index === 0}
                  isLast={index === searchResults.length - 1}
                />
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    )
  }

  // Empty state
  if (groupedNotes.length === 0) {
    return (
      <EmptyState
        icon="📝"
        title={t('noNotes')}
        description={t('noNotesDesc')}
      />
    )
  }

  // Grouped notes list - Apple Notes style
  return (
    <div className="pt-6 mb-20">
      <AnimatePresence mode="popLayout">
        {groupedNotes.map((group, groupIndex) => (
          <DateGroup
            key={group.label}
            label={group.label}
            notes={group.notes}
            groupIndex={groupIndex}
            onSelectNote={onSelectNote}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
