import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useTelegram } from './hooks/useTelegram'
import { NotesList } from './components/NotesList'
import { NoteDetail } from './components/NoteDetail'
import { SharedNoteView } from './components/SharedNoteView'
import { SearchBar } from './components/SearchBar'
import { Note, api } from './api/client'
import { useNotes } from './hooks/useNotes'

type ViewState = 'list' | 'detail' | 'shared'

function App() {
  const { 
    ready, 
    expand, 
    themeParams, 
    colorScheme, 
    startParam,
    showBackButton,
    hideBackButton,
    close
  } = useTelegram()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [viewState, setViewState] = useState<ViewState>('list')
  const [shareToken, setShareToken] = useState<string | null>(null)
  const { deleteNote } = useNotes()

  // Check if opened via share link (start_param)
  const { data: sharedData, isLoading: isLoadingShared } = useQuery({
    queryKey: ['shared', shareToken],
    queryFn: () => api.getSharedNote(shareToken!),
    enabled: !!shareToken,
  })

  // Initialize app
  useEffect(() => {
    ready()
    expand()
    
    // Check for share token in start_param
    if (startParam) {
      setShareToken(startParam)
      setViewState('shared')
    }
  }, [ready, expand, startParam])

  // Handle Telegram BackButton
  const handleBack = useCallback(() => {
    if (viewState === 'detail') {
      setSelectedNote(null)
      setViewState('list')
    } else if (viewState === 'shared') {
      // Close the app when viewing shared note
      close()
    }
  }, [viewState, close])

  // Manage BackButton visibility
  useEffect(() => {
    if (viewState === 'list') {
      hideBackButton()
    } else {
      showBackButton(handleBack)
    }
    
    return () => hideBackButton()
  }, [viewState, showBackButton, hideBackButton, handleBack])

  // Apply theme
  useEffect(() => {
    const isDarkMode = colorScheme === 'dark'
    
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

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
    setViewState('detail')
  }

  const handleBackToList = () => {
    setSelectedNote(null)
    setViewState('list')
  }

  const handleDeleteNote = (id: string) => {
    deleteNote(id)
    setSelectedNote(null)
    setViewState('list')
  }

  // Render shared note view
  if (viewState === 'shared') {
    return (
      <div 
        className="min-h-screen"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)'
        }}
      >
        <SharedNoteView 
          data={sharedData} 
          isLoading={isLoadingShared}
        />
      </div>
    )
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
        {selectedNote && viewState === 'detail' ? (
          <NoteDetail
            key="detail"
            note={selectedNote}
            onBack={handleBackToList}
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
