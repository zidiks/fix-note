import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useTelegram } from './hooks/useTelegram'
import { NotesList } from './components/NotesList'
import { NoteDetail } from './components/NoteDetail'
import { SearchBar } from './components/SearchBar'
import { Note } from './api/client'
import { useNotes } from './hooks/useNotes'

function App() {
  const { ready, expand, themeParams, colorScheme } = useTelegram()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const { deleteNote } = useNotes()

  useEffect(() => {
    // Initialize Telegram WebApp
    ready()
    expand()
  }, [ready, expand])

  useEffect(() => {
    // Detect dark mode from Telegram colorScheme
    const isDarkMode = colorScheme === 'dark'
    
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    // Apply Telegram theme colors as CSS variables
    if (themeParams) {
      if (themeParams.bg_color) {
        document.documentElement.style.setProperty('--tg-theme-bg-color', themeParams.bg_color)
        document.documentElement.style.setProperty('--bg-primary', themeParams.bg_color)
      }
      if (themeParams.text_color) {
        document.documentElement.style.setProperty('--tg-theme-text-color', themeParams.text_color)
        document.documentElement.style.setProperty('--text-primary', themeParams.text_color)
      }
      if (themeParams.hint_color) {
        document.documentElement.style.setProperty('--tg-theme-hint-color', themeParams.hint_color)
        document.documentElement.style.setProperty('--text-secondary', themeParams.hint_color)
      }
      if (themeParams.link_color) {
        document.documentElement.style.setProperty('--tg-theme-link-color', themeParams.link_color)
        document.documentElement.style.setProperty('--accent', themeParams.link_color)
      }
      if (themeParams.button_color) {
        document.documentElement.style.setProperty('--tg-theme-button-color', themeParams.button_color)
      }
      if (themeParams.secondary_bg_color) {
        document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', themeParams.secondary_bg_color)
        document.documentElement.style.setProperty('--bg-secondary', themeParams.secondary_bg_color)
      }
    }
  }, [colorScheme, themeParams])

  const handleSelectNote = (note: Note) => {
    setSelectedNote(note)
  }

  const handleBack = () => {
    setSelectedNote(null)
  }

  const handleDeleteNote = (id: string) => {
    deleteNote(id)
    setSelectedNote(null)
  }

  return (
    <div 
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)'
      }}
    >
      <AnimatePresence mode="wait">
        {selectedNote ? (
          <NoteDetail
            key="detail"
            note={selectedNote}
            onBack={handleBack}
            onDelete={handleDeleteNote}
          />
        ) : (
          <div key="list">
            {/* Header */}
            <header 
              className="sticky top-0 z-50 safe-area-top"
              style={{
                backgroundColor: 'var(--bg-primary)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <div className="px-4 py-3">
                <h1 
                  className="text-2xl font-bold mb-3"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Заметки
                </h1>
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Поиск заметок..."
                />
              </div>
            </header>

            {/* Content */}
            <main className="pb-8 safe-area-bottom">
              <NotesList 
                searchQuery={searchQuery} 
                onSelectNote={handleSelectNote}
              />
            </main>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
