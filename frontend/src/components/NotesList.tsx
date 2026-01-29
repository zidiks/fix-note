import { motion, AnimatePresence } from 'framer-motion'
import { useNotes, useSearchNotes } from '../hooks/useNotes'
import { DateGroup } from './DateGroup'
import { NoteCard } from './NoteCard'
import { useTelegram } from '../hooks/useTelegram'
import { Note } from '../api/client'

interface NotesListProps {
  searchQuery: string
  onSelectNote?: (note: Note) => void
}

export const NotesList = ({ searchQuery, onSelectNote }: NotesListProps) => {
  const { hapticNotification } = useTelegram()
  const { groupedNotes, isLoading, deleteNote } = useNotes()
  const { results: searchResults, isLoading: isSearching } = useSearchNotes(searchQuery)

  const isSearchMode = searchQuery.length >= 2
  const showLoading = isLoading || (isSearchMode && isSearching)

  const handleDelete = (id: string) => {
    deleteNote(id, {
      onSuccess: () => {
        hapticNotification('success')
      },
      onError: () => {
        hapticNotification('error')
      },
    })
  }

  // Loading state
  if (showLoading) {
    return (
      <div className="px-4 pt-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="ios-card p-4 mb-3" style={{
            backgroundColor: 'var(--bg-secondary)'
          }}>
            <div className="flex gap-3">
              <div className="w-8 h-8 skeleton rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 skeleton w-3/4" />
                <div className="h-3 skeleton w-full" />
                <div className="h-3 skeleton w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Search results
  if (isSearchMode) {
    if (searchResults.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3 className="empty-state-title">Ничего не найдено</h3>
          <p className="empty-state-text">
            Попробуйте изменить поисковый запрос
          </p>
        </div>
      )
    }

    return (
      <div className="pt-2">
        <div className="section-header">
          Результаты поиска ({searchResults.length})
        </div>

        <AnimatePresence mode="popLayout">
          {searchResults.map((result, index) => (
            <motion.div
              key={result.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className="ios-card p-4 mx-4 mb-2 cursor-pointer haptic-tap"
              onClick={() => {
                // Convert search result to Note-like object for viewing
                if (onSelectNote) {
                  onSelectNote({
                    id: result.id,
                    user_id: '',
                    content: result.content,
                    summary: result.summary,
                    source: 'text',
                    duration_seconds: null,
                    created_at: result.created_at,
                    updated_at: result.created_at,
                  })
                }
              }}
              style={{
                backgroundColor: 'var(--bg-secondary)'
              }}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">🔍</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'rgba(0, 122, 255, 0.1)',
                        color: 'var(--accent)'
                      }}
                    >
                      {Math.round(result.similarity * 100)}% совпадение
                    </span>
                  </div>

                  <p
                    className="text-sm line-clamp-3"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {result.summary || result.content}
                  </p>
                </div>
                
                {/* Chevron */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="flex-shrink-0 mt-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    )
  }

  // Empty state
  if (groupedNotes.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📝</div>
        <h3 className="empty-state-title">Нет заметок</h3>
        <p className="empty-state-text">
          Отправьте голосовое или текстовое сообщение боту, чтобы создать первую заметку
        </p>
      </div>
    )
  }

  // Grouped notes list
  return (
    <div className="pt-2">
      <AnimatePresence mode="popLayout">
        {groupedNotes.map((group, groupIndex) => (
          <DateGroup
            key={group.label}
            label={group.label}
            notes={group.notes}
            groupIndex={groupIndex}
            onDeleteNote={handleDelete}
            onSelectNote={onSelectNote}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
