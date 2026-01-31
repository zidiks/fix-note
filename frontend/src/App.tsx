import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useTelegram } from './hooks/useTelegram'
import { NotesList } from './components/NotesList'
import { NoteDetail } from './components/NoteDetail'
import { SharedNoteView } from './components/SharedNoteView'
import { SearchBar } from './components/SearchBar'
import { ProfilePage } from './components/ProfilePage'
import { LanguagePage } from './components/LanguagePage'
import { SubscriptionPage } from './components/SubscriptionPage'
import { Paywall } from './components/Paywall'
import { Note, api } from './api/client'
import { useNotes } from './hooks/useNotes'
import { useI18n } from './i18n'
import { useSubscription } from './stores/subscription'

type ViewState = 'list' | 'detail' | 'shared' | 'profile' | 'language' | 'subscription'

function App() {
  const {
    ready,
    expand,
    disableVerticalSwipes,
    themeParams,
    colorScheme,
    startParam,
    showBackButton,
    hideBackButton,
    close,
    user,
    setHeaderColor,
    setBackgroundColor,
    hapticImpact
  } = useTelegram()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [viewState, setViewState] = useState<ViewState>('list')
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [paywallFeature, setPaywallFeature] = useState<'summary' | 'voice' | 'chat' | 'sync' | null>(null)
  const { deleteNote, refetchNotes } = useNotes()
  const { t, setLanguage } = useI18n()
  const { fetchSubscription } = useSubscription()

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
    disableVerticalSwipes()

    // Check for share token in start_param
    if (startParam) {
      setShareToken(startParam)
      setViewState('shared')
    }
    
    // Fetch subscription info
    fetchSubscription()
    
    // Set language from Telegram user if first time
    if (user?.language_code && !localStorage.getItem('fixnote-i18n')) {
      const lang = user.language_code.startsWith('ru') ? 'ru' : 'en'
      setLanguage(lang)
    }
  }, [ready, expand, disableVerticalSwipes, startParam, fetchSubscription, user, setLanguage])

  // Set header and background color explicitly to prevent color change on scroll
  useEffect(() => {
    // Use explicit color from themeParams or default
    const bgColor = themeParams?.bg_color || (colorScheme === 'dark' ? '#000000' : '#F2F2F7')
    setHeaderColor(bgColor)
    setBackgroundColor(bgColor)
  }, [themeParams, colorScheme, setHeaderColor, setBackgroundColor])

  // Handle Telegram BackButton
  const handleBack = useCallback(() => {
    if (viewState === 'detail') {
      setSelectedNote(null)
      setViewState('list')
    } else if (viewState === 'shared') {
      // Close the app when viewing shared note
      close()
    } else if (viewState === 'language' || viewState === 'subscription') {
      setViewState('profile')
    } else if (viewState === 'profile') {
      setViewState('list')
    }
  }, [viewState, close])

  // Manage BackButton visibility
  useEffect(() => {
    if (viewState === 'list' || viewState === 'shared') {
      // Hide back button on list view and shared view (shared uses native close)
      hideBackButton()
    } else {
      showBackButton(handleBack)
    }

    return () => hideBackButton()
  }, [viewState, showBackButton, hideBackButton, handleBack])
  
  // Navigation handlers for profile pages
  const handleProfileClick = () => {
    hapticImpact('light')
    setViewState('profile')
  }
  
  const handleLanguageClick = () => {
    hapticImpact('light')
    setViewState('language')
  }
  
  const handleSubscriptionClick = () => {
    hapticImpact('light')
    setViewState('subscription')
  }
  
  const handleBackToList = () => {
    setSelectedNote(null)
    setViewState('list')
  }
  
  const handleBackToProfile = () => {
    setViewState('profile')
  }
  
  const closePaywall = () => {
    setPaywallFeature(null)
  }
  
  const handlePaywallUpgrade = () => {
    setPaywallFeature(null)
    setViewState('subscription')
  }

  // Scroll to top when search query changes
  useEffect(() => {
    if (searchQuery) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [searchQuery])

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

  const handleDeleteNote = (id: string) => {
    deleteNote(id)
    setSelectedNote(null)
    setViewState('list')
  }

  const handleUpdateNote = (updatedNote: Note) => {
    setSelectedNote(updatedNote)
    refetchNotes()
  }

  const handleAddNote = async () => {
    hapticImpact('medium')
    // Trigger bot to send prompt message, then close mini app
    try {
      await api.promptAddNote()
    } catch {
      // Ignore errors - still close the app
    }
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
        {viewState === 'profile' ? (
          <ProfilePage
            key="profile"
            onBack={handleBackToList}
            onLanguageClick={handleLanguageClick}
            onSubscriptionClick={handleSubscriptionClick}
          />
        ) : viewState === 'language' ? (
          <LanguagePage
            key="language"
            onBack={handleBackToProfile}
          />
        ) : viewState === 'subscription' ? (
          <SubscriptionPage
            key="subscription"
            onBack={handleBackToProfile}
          />
        ) : selectedNote && viewState === 'detail' ? (
          <NoteDetail
            key="detail"
            note={selectedNote}
            onBack={handleBackToList}
            onDelete={handleDeleteNote}
            onUpdate={handleUpdateNote}
          />
        ) : (
          <div key="list" className="notes-list-container">
            {/* Top fade gradient */}
            <div className="top-fade" />

            {/* Header - fixed */}
            <header
              className="fixed top-0 left-0 right-0 z-40 safe-area-top"
            >
              <div className="px-4 py-3 flex items-center justify-between">
                <h1
                  className="text-2xl font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t('notes')}
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
              placeholder={t('searchPlaceholder')}
              onAddNote={handleAddNote}
            />
          </div>
        )}
      </AnimatePresence>
      
      {/* Paywall Modal */}
      <Paywall
        isOpen={paywallFeature !== null}
        onClose={closePaywall}
        feature={paywallFeature || 'summary'}
        onUpgrade={handlePaywallUpgrade}
      />
    </div>
  )
}

export default App
