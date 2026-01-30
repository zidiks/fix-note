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
    close,
    showPopup,
    user,
    setHeaderColor,
    hapticImpact
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
    // Set header color to match background
    setHeaderColor('bg_color')

    // Check for share token in start_param
    if (startParam) {
      setShareToken(startParam)
      setViewState('shared')
    }
  }, [ready, expand, startParam, setHeaderColor])

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

  const handleProfileClick = () => {
    hapticImpact('light')
    showPopup({
      title: user?.first_name || 'Профиль',
      message: `@${user?.username || 'user'}\n\nВсе ваши заметки синхронизируются с этим аккаунтом Telegram.`,
      buttons: [
        { id: 'ok', type: 'ok', text: 'OK' }
      ]
    })
  }

  const handleAddNote = () => {
    hapticImpact('medium')
    // Close mini app to open bot chat for adding note
    close()
  }

  // Get user initials for avatar fallback
  const getInitials = () => {
    if (!user) return '?'
    const first = user.first_name?.[0] || ''
    const last = user.last_name?.[0] || ''
    return (first + last).toUpperCase() || '?'
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
          <div key="list" className="notes-list-container">
            {/* Top fade gradient */}
            <div className="top-fade" />

            {/* Header - fixed with frosted glass effect */}
            <header
              className="fixed top-0 left-0 right-0 z-40 safe-area-top"
            >
              <div className="px-4 py-3 flex items-center justify-between">
                <h1
                  className="text-2xl font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Заметки
                </h1>

                {/* Profile avatar in header */}
                <button
                  className="header-avatar"
                  onClick={handleProfileClick}
                >
                  {user?.photo_url ? (
                    <img
                      src={user.photo_url}
                      alt="Profile"
                      className="header-avatar__image"
                    />
                  ) : (
                    <span className="header-avatar__initials">
                      {getInitials()}
                    </span>
                  )}
                </button>
              </div>
            </header>

            {/* Content - with top padding for fixed header and bottom padding for search bar */}
            <main className="pt-[52px] mb-24 safe-area-bottom">
              <NotesList
                searchQuery={searchQuery}
                onSelectNote={handleSelectNote}
              />
            </main>

            {/* Bottom Search Bar - Liquid Glass style */}
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Поиск заметок..."
              onAddNote={handleAddNote}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
