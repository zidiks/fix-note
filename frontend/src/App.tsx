import { useEffect, useState, useCallback, useRef, type PointerEvent } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTelegram } from './hooks/useTelegram'
import { useTelegramTheme } from './hooks/useTelegramTheme'
import { NotesList } from './components/NotesList'
import { NoteDetail } from './components/NoteDetail'
import { SharedNoteView } from './components/SharedNoteView'
import { SearchBar } from './components/SearchBar'
import { ProfilePage } from './components/ProfilePage'
import { LanguagePage } from './components/LanguagePage'
import { SubscriptionPage } from './components/SubscriptionPage'
import { SyncSettingsPage } from './components/SyncSettingsPage'
import { Paywall } from './components/Paywall'
import { EntryPaywall } from './components/EntryPaywall'
import { Note, api } from './api/client'
import { useNotes } from './hooks/useNotes'
import { useI18n } from './i18n'
import { useSubscription } from './stores/subscription'

type ViewState = 'list' | 'detail' | 'shared' | 'profile' | 'language' | 'subscription' | 'sync'

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
    hapticImpact
  } = useTelegram()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState('All')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [viewState, setViewState] = useState<ViewState>('list')
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [isEntryPaywallOpen, setIsEntryPaywallOpen] = useState(false)
  const [paywallFeature, setPaywallFeature] = useState<'summary' | 'voice' | 'chat' | 'sync' | null>(null)
  const { deleteNote, refetchNotes } = useNotes()
  const { t, setLanguage } = useI18n()
  const { subscription, fetchSubscription } = useSubscription()
  const queryClient = useQueryClient()
  const listRef = useRef<HTMLDivElement | null>(null)
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null)
  const entryPaywallShownRef = useRef(false)
  const pullStartYRef = useRef(0)
  const pullDistanceRef = useRef(0)
  const activePointerIdRef = useRef<number | null>(null)
  const activeTouchIdRef = useRef<number | null>(null)
  const hapticTriggeredRef = useRef(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isPulling, setIsPulling] = useState(false)
  const [isPullArmed, setIsPullArmed] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const PULL_THRESHOLD = 90
  const PULL_MAX = 140
  const PULL_RESISTANCE = 0.6
  const INDICATOR_HEIGHT = 56

  // Check if opened via share link (start_param)
  const { data: sharedData, isLoading: isLoadingShared } = useQuery({
    queryKey: ['shared', shareToken],
    queryFn: () => api.getSharedNote(shareToken!),
    enabled: !!shareToken,
  })

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.getTags(),
    enabled: viewState !== 'shared',
  })
  const tags = tagsData?.tags || ['All']

  const createTagMutation = useMutation({
    mutationFn: (name: string) => api.createTag(name),
    onSuccess: ({ tag }) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setSelectedTag(tag)
    },
  })

  // Initialize app
  useEffect(() => {
    ready()
    expand()
    disableVerticalSwipes()

    // Check for start_param or URL parameter
    const urlParams = new URLSearchParams(window.location.search)
    const noteId = urlParams.get('note')
    
    if (noteId) {
      // Open note by ID from URL parameter
      api.getNote(noteId)
        .then((note) => {
          setSelectedNote(note)
          setViewState('detail')
        })
        .catch((error) => {
          console.error('Failed to load note:', error)
        })
    } else if (startParam) {
      // Check if it's a Notion OAuth code (format: notion_code_XXXXX)
      if (startParam.startsWith('notion_code_')) {
        // Navigate to sync settings - it will check for pending OAuth in database
        setViewState('sync')
      } else {
        // Assume it's a share token
        setShareToken(startParam)
        setViewState('shared')
      }
    }
    
    // Fetch subscription info
    fetchSubscription()
    
    // Set language from Telegram user if first time
    if (user?.language_code && !localStorage.getItem('fixnote-i18n')) {
      const lang = user.language_code.startsWith('ru') ? 'ru' : 'en'
      setLanguage(lang)
    }
  }, [ready, expand, disableVerticalSwipes, startParam, fetchSubscription, user, setLanguage])

  // Use Telegram theme hook to manage header and background colors based on view state
  useTelegramTheme(viewState)

  // Show entry paywall for trial/free users on app entry.
  useEffect(() => {
    if (entryPaywallShownRef.current) return
    if (!subscription) return
    if (shareToken || selectedNote || viewState !== 'list') return

    if (subscription.plan === 'trial' || subscription.plan === 'free') {
      setIsEntryPaywallOpen(true)
      entryPaywallShownRef.current = true
    }
  }, [subscription, shareToken, selectedNote, viewState])

  // Handle Telegram BackButton
  const handleBack = useCallback(() => {
    if (viewState === 'detail') {
      setSelectedNote(null)
      setViewState('list')
    } else if (viewState === 'shared') {
      // Close the app when viewing shared note
      close()
    } else if (viewState === 'language' || viewState === 'subscription' || viewState === 'sync') {
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
  
  const handleSyncClick = () => {
    hapticImpact('light')
    setViewState('sync')
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

  const closeEntryPaywall = () => {
    setIsEntryPaywallOpen(false)
  }

  const handleAddTag = () => {
    hapticImpact('light')
    const raw = window.prompt(t('addTagPrompt'))
    if (!raw) return
    const name = raw.trim()
    if (!name) return
    createTagMutation.mutate(name)
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

    // Apply dark/light class based on colorScheme
    // Apply to both html and body to ensure CSS variables work everywhere
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
      document.body.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
      document.body.classList.remove('dark')
    }

    // Force set CSS variables via JavaScript to ensure they work in Telegram WebView
    // This is critical for Telegram WebView which may not respect CSS classes properly
    const root = document.documentElement
    
    if (isDarkMode) {
      // Dark mode colors
      root.style.setProperty('--bg-primary', '#000000')
      root.style.setProperty('--bg-secondary', '#1C1C1E')
      root.style.setProperty('--text-primary', '#FFFFFF')
      root.style.setProperty('--text-secondary', '#8E8E93')
      root.style.setProperty('--text-tertiary', '#636366')
      root.style.setProperty('--separator', '#38383A')
      root.style.setProperty('--destructive', '#FF453A')
      root.style.setProperty('--success', '#30D158')
      root.style.setProperty('--warning', '#FF9F0A')
    } else {
      // Light mode colors
      root.style.setProperty('--bg-primary', '#F0F0F2')
      root.style.setProperty('--bg-secondary', '#FCFCFC')
      root.style.setProperty('--text-primary', '#29333F')
      root.style.setProperty('--text-secondary', '#8C9198')
      root.style.setProperty('--text-tertiary', '#AEAEB2')
      root.style.setProperty('--separator', 'rgba(60, 60, 67, 0.12)')
      root.style.setProperty('--destructive', '#FF3B30')
      root.style.setProperty('--success', '#34C759')
      root.style.setProperty('--warning', '#FF9500')
    }

    // Set Telegram-specific theme variables
    if (themeParams) {
      if (themeParams.bg_color) {
        root.style.setProperty('--tg-theme-bg-color', themeParams.bg_color)
      }
      if (themeParams.text_color) {
        root.style.setProperty('--tg-theme-text-color', themeParams.text_color)
      }
      if (themeParams.hint_color) {
        root.style.setProperty('--tg-theme-hint-color', themeParams.hint_color)
      }
      if (themeParams.link_color) {
        root.style.setProperty('--tg-theme-link-color', themeParams.link_color)
        root.style.setProperty('--accent', themeParams.link_color)
      }
      if (themeParams.button_color) {
        root.style.setProperty('--tg-theme-button-color', themeParams.button_color)
      }
      if (themeParams.secondary_bg_color) {
        root.style.setProperty('--tg-theme-secondary-bg-color', themeParams.secondary_bg_color)
      }
    }
  }, [colorScheme, themeParams])

  const isPullEnabled = viewState === 'list' && searchQuery.length < 2
  const pullProgress = Math.min(1, pullDistance / PULL_THRESHOLD)

  const setPull = useCallback((value: number) => {
    pullDistanceRef.current = value
    setPullDistance(value)
  }, [])

  const setPulling = useCallback((value: boolean) => {
    setIsPulling(value)
  }, [])

  const setListContainerRef = useCallback((node: HTMLDivElement | null) => {
    listRef.current = node
    setListElement(node)
  }, [])

  useEffect(() => {
    if (!isPullEnabled) {
      setPull(0)
      setPulling(false)
      setIsPullArmed(false)
      setIsRefreshing(false)
      activePointerIdRef.current = null
      activeTouchIdRef.current = null
      hapticTriggeredRef.current = false
    }
  }, [isPullEnabled, setPull, setPulling])

  const handlePullStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    if (!isPullEnabled || isRefreshing) return
    if (event.button !== 0) return
    if ((listRef.current?.scrollTop ?? 0) > 0) return

    activePointerIdRef.current = event.pointerId
    pullStartYRef.current = event.clientY
    hapticTriggeredRef.current = false
    setPulling(true)
  }

  const handlePullMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    if (!isPullEnabled || isRefreshing) return
    if (activePointerIdRef.current !== event.pointerId) return
    if ((listRef.current?.scrollTop ?? 0) > 0) return

    const delta = event.clientY - pullStartYRef.current
    if (delta <= 0) {
      if (pullDistanceRef.current !== 0) {
        setPull(0)
      }
      if (isPullArmed) setIsPullArmed(false)
      return
    }

    const distance = Math.min(PULL_MAX, delta * PULL_RESISTANCE)
    setPull(distance)
    const armed = distance >= PULL_THRESHOLD
    setIsPullArmed(armed)
    if (armed && !hapticTriggeredRef.current) {
      hapticImpact('medium')
      hapticTriggeredRef.current = true
    }
    if (!armed) {
      hapticTriggeredRef.current = false
    }
  }

  const handlePullEnd = async (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    if (activePointerIdRef.current !== event.pointerId) return
    activePointerIdRef.current = null
    setPulling(false)

    if (pullDistanceRef.current >= PULL_THRESHOLD && isPullEnabled && !isRefreshing) {
      setIsPullArmed(false)
      setIsRefreshing(true)
      setPull(PULL_THRESHOLD)
      try {
        await refetchNotes()
      } finally {
        setIsRefreshing(false)
        setPull(0)
      }
      return
    }

    setIsPullArmed(false)
    setPull(0)
  }

  const handlePullCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    if (activePointerIdRef.current !== event.pointerId) return
    activePointerIdRef.current = null
    setPulling(false)
    setIsPullArmed(false)
    setPull(0)
  }

  useEffect(() => {
    const container = listElement
    if (!container) return

    const handleTouchStart = (event: TouchEvent) => {
      if (!isPullEnabled || isRefreshing) return
      if ((listRef.current?.scrollTop ?? 0) > 0) return
      if (activeTouchIdRef.current !== null) return

      const touch = event.touches[0]
      if (!touch) return
      activeTouchIdRef.current = touch.identifier
      pullStartYRef.current = touch.clientY
      hapticTriggeredRef.current = false
      setPulling(true)
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (!isPullEnabled || isRefreshing) return
      if (activeTouchIdRef.current === null) return

      const touch = Array.from(event.touches).find(t => t.identifier === activeTouchIdRef.current)
      if (!touch) return
      if ((listRef.current?.scrollTop ?? 0) > 0) return

      const delta = touch.clientY - pullStartYRef.current
      if (delta <= 0) {
        if (pullDistanceRef.current !== 0) {
          setPull(0)
        }
        if (isPullArmed) setIsPullArmed(false)
        return
      }

      event.preventDefault()

      const distance = Math.min(PULL_MAX, delta * PULL_RESISTANCE)
      setPull(distance)
      const armed = distance >= PULL_THRESHOLD
      setIsPullArmed(armed)
      if (armed && !hapticTriggeredRef.current) {
        hapticImpact('medium')
        hapticTriggeredRef.current = true
      }
      if (!armed) {
        hapticTriggeredRef.current = false
      }
    }

    const handleTouchEnd = async (event: TouchEvent) => {
      if (activeTouchIdRef.current === null) return
      const ended = Array.from(event.changedTouches).some(t => t.identifier === activeTouchIdRef.current)
      if (!ended) return

      activeTouchIdRef.current = null
      setPulling(false)

      if (pullDistanceRef.current >= PULL_THRESHOLD && isPullEnabled && !isRefreshing) {
        setIsPullArmed(false)
        setIsRefreshing(true)
        setPull(PULL_THRESHOLD)
        try {
          await refetchNotes()
        } finally {
          setIsRefreshing(false)
          setPull(0)
        }
        return
      }

      setIsPullArmed(false)
      setPull(0)
    }

    const handleTouchCancel = (event: TouchEvent) => {
      if (activeTouchIdRef.current === null) return
      const canceled = Array.from(event.changedTouches).some(t => t.identifier === activeTouchIdRef.current)
      if (!canceled) return

      activeTouchIdRef.current = null
      setPulling(false)
      setIsPullArmed(false)
      setPull(0)
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })
    container.addEventListener('touchcancel', handleTouchCancel, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchcancel', handleTouchCancel)
    }
  }, [isPullEnabled, isRefreshing, isPullArmed, hapticImpact, listElement, refetchNotes, setPull, setPulling])

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
    queryClient.invalidateQueries({ queryKey: ['tags'] })
  }

  useEffect(() => {
    if (!tags.includes(selectedTag)) {
      setSelectedTag('All')
    }
  }, [selectedTag, tags])

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
            onSyncClick={handleSyncClick}
          />
        ) : viewState === 'sync' ? (
          <SyncSettingsPage
            key="sync"
            onBack={handleBackToProfile}
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
            tags={tags}
            onBack={handleBackToList}
            onDelete={handleDeleteNote}
            onUpdate={handleUpdateNote}
          />
        ) : (
          <div key="list" className="notes-list-container" style={{ height: '100dvh', overflow: 'hidden' }}>
            {/* Top fade gradient */}
            <div className="top-fade" />

            {/* Header - fixed */}
            <header
              className="fixed top-0 left-0 right-0 z-40 safe-area-top"
            >
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1">
                    <button
                      className="h-9 w-9 rounded-full flex items-center justify-center text-lg font-medium flex-shrink-0 border"
                      style={{
                        backgroundColor: '#FFFFFF',
                        color: '#1F2937',
                        borderColor: 'rgba(31, 41, 55, 0.15)',
                      }}
                      onClick={handleAddTag}
                      disabled={createTagMutation.isPending}
                    >
                      +
                    </button>
                    {tags.map((tag) => {
                      const isActive = selectedTag === tag
                      return (
                        <button
                          key={tag}
                          className="h-9 px-4 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 border transition-colors"
                          style={{
                            backgroundColor: '#FFFFFF',
                            color: isActive ? '#111827' : '#374151',
                            borderColor: isActive ? '#111827' : 'rgba(31, 41, 55, 0.12)',
                          }}
                          onClick={() => {
                            hapticImpact('light')
                            setSelectedTag(tag)
                          }}
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                </div>

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
            <main 
              className="pt-[52px] pb-24 safe-area-bottom overflow-y-auto hide-scrollbar"
              style={{ 
                height: '100%',
                maxHeight: '100%'
              }}
              ref={setListContainerRef}
              onPointerDown={handlePullStart}
              onPointerMove={handlePullMove}
              onPointerUp={handlePullEnd}
              onPointerCancel={handlePullCancel}
            >
              <div className="pull-to-refresh">
                <div
                  className="pull-indicator"
                  style={{
                    transform: `translateY(${pullDistance - INDICATOR_HEIGHT}px)`,
                    opacity: pullDistance > 0 || isRefreshing ? 1 : 0,
                    transition: isPulling ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
                  }}
                >
                  <div
                    className="pull-indicator__spinner"
                    style={{
                      transform: `rotate(${isRefreshing ? 0 : pullProgress * 180}deg) scale(${isRefreshing ? 1 : 0.6 + pullProgress * 0.4})`,
                      opacity: isRefreshing ? 1 : Math.min(1, 0.2 + pullProgress),
                      transition: isPulling ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
                    }}
                  >
                    <div className={`spinner ${isRefreshing ? '' : 'spinner--paused'}`} />
                  </div>
                </div>

                <div
                  className="pull-content"
                  style={{
                    transform: `translateY(${pullDistance}px)`,
                    transition: isPulling ? 'none' : 'transform 0.2s ease',
                  }}
                >
                  <NotesList
                    searchQuery={searchQuery}
                    selectedTag={selectedTag}
                    onSelectNote={handleSelectNote}
                  />
                </div>
              </div>
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
      <EntryPaywall
        isOpen={isEntryPaywallOpen}
        onClose={closeEntryPaywall}
      />

      {/* Feature Paywall Modal */}
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
