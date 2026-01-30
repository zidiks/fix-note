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
  const { hapticImpact } = useTelegram()
  const { groupedNotes, isLoading, total } = useNotes()
  const { results: searchResults, isLoading: isSearching } = useSearchNotes(searchQuery)

  const isSearchMode = searchQuery.length >= 2
  const showLoading = isLoading || (isSearchMode && isSearching)

  // Loading state
  if (showLoading) {
    return (
      <div className="px-4 pt-4">
        <div className="mb-6">
          <div className="h-6 w-32 skeleton rounded mb-2" />
          <div 
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-4 py-3">
                <div className="h-5 skeleton w-3/4 mb-1.5" />
                <div className="h-4 skeleton w-full" />
                {i < 3 && (
                  <div className="h-px mt-3" style={{ backgroundColor: 'var(--separator)' }} />
                )}
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
        <div className="flex flex-col items-center justify-center pt-20 px-4">
          <div className="text-5xl mb-4">🔍</div>
          <h3 
            className="text-lg font-semibold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            Ничего не найдено
          </h3>
          <p 
            className="text-center"
            style={{ color: 'var(--text-secondary)' }}
          >
            Попробуйте изменить поисковый запрос
          </p>
        </div>
      )
    }

    return (
      <div className="pt-4">
        <h2 
          className="text-xl font-bold px-4 mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Результаты ({searchResults.length})
        </h2>

        <div 
          className="mx-4 overflow-hidden rounded-xl"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <AnimatePresence mode="popLayout">
            {searchResults.map((result, index) => (
              <motion.div
                key={result.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="active:opacity-70 transition-opacity cursor-pointer"
                onClick={() => {
                  hapticImpact('light')
                  if (onSelectNote) {
                    onSelectNote({
                      id: result.id,
                      user_id: '',
                      content: result.content,
                      summary: result.summary,
                      source: result.source || 'text',
                      duration_seconds: result.duration_seconds,
                      created_at: result.created_at,
                      updated_at: result.created_at,
                    })
                  }
                }}
              >
                <div className="px-4 py-3">
                  <h3
                    className="font-semibold text-base leading-tight truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {result.summary?.split('\n')[0] || result.content.split('\n')[0].slice(0, 50)}
                  </h3>
                  <p
                    className="text-sm truncate mt-0.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {result.content.slice(0, 100)}
                  </p>
                </div>
                {index < searchResults.length - 1 && (
                  <div 
                    className="h-px ml-4"
                    style={{ backgroundColor: 'var(--separator)' }}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    )
  }

  // Empty state
  if (groupedNotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center pt-20 px-4">
        <div className="text-5xl mb-4">📝</div>
        <h3 
          className="text-lg font-semibold mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          Нет заметок
        </h3>
        <p 
          className="text-center"
          style={{ color: 'var(--text-secondary)' }}
        >
          Отправьте голосовое или текстовое сообщение боту, чтобы создать первую заметку
        </p>
      </div>
    )
  }

  // Grouped notes list - Apple Notes style
  return (
    <div className="pt-4">
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
