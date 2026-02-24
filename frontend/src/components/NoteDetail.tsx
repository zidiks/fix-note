import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { format, isToday, isYesterday } from 'date-fns'
import { enUS, ru } from 'date-fns/locale'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Note, api } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'
import { useSubscription } from '../stores/subscription'
import { useI18n } from '../i18n'
import { ImageGallery } from './ui/ImageGallery'
import { LinkPreview, extractUrls } from './ui/LinkPreview'
import { Toast } from './ui/Toast'
import { VoicePlayer } from './ui/VoicePlayer'
import { NoteTabs } from './NoteDetail/NoteTabs'
import { NoteActionBar } from './NoteDetail/NoteActionBar'

interface NoteDetailProps {
  note: Note
  tags?: string[]
  onBack?: () => void
  onDelete?: (id: string) => void
  onUpdate?: (note: Note) => void
}

export const NoteDetail = ({ note, tags = ['All'], onDelete, onUpdate }: NoteDetailProps) => {
  const { hapticImpact, hapticNotification, showConfirm, shareText, showAlert, switchInlineQuery, close } = useTelegram()
  const { subscription } = useSubscription()
  const { t, language } = useI18n()
  const queryClient = useQueryClient()
  const locale = language === 'ru' ? ru : enUS
  const [isSharing, setIsSharing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(note.content)
  const [editedSummary, setEditedSummary] = useState(note.summary || '')
  const [editedTag, setEditedTag] = useState(note.tag || 'All')
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [delayedKeyboardHeight, setDelayedKeyboardHeight] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [activeTab, setActiveTab] = useState<'summary' | 'full'>(() => (note.summary ? 'summary' : 'full'))
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [actionBarVisible, setActionBarVisible] = useState(true)
  const [actionBarTargetHeight, setActionBarTargetHeight] = useState(0)
  const contentContainerRef = useRef<HTMLDivElement>(null)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const summaryBlockRef = useRef<HTMLTextAreaElement>(null)
  const fullContentBlockRef = useRef<HTMLTextAreaElement>(null)
  const cursorMirrorRef = useRef<HTMLDivElement | null>(null)
  const keyboardOpeningStartTimeRef = useRef<number>(0)
  const actionBarShownAfterKeyboardRef = useRef<boolean>(false)

  // Default to summary tab when note has summary, otherwise full text; reset when note changes
  useEffect(() => {
    setActiveTab(note.summary ? 'summary' : 'full')
  }, [note.id, note.summary])

  useEffect(() => {
    setEditedContent(note.content)
    setEditedSummary(note.summary || '')
    setEditedTag(note.tag || 'All')
  }, [note.id, note.content, note.summary, note.tag])

  // Check if sync is enabled for user
  const canSync = subscription?.limits.sync_enabled ?? false

  const isVoice = note.source === 'voice'
  const hasImages = note.images && note.images.length > 0

  // Display title: AI-generated or first line of summary/content
  const displayTitle = note.title?.trim() ||
    (note.summary ? note.summary.split('\n')[0].trim() : null) ||
    note.content.split('\n')[0].trim() ||
    null

  // Extract URLs from content
  const urls = useMemo(() => extractUrls(note.content), [note.content])

  const formattedDate = useMemo(() => {
    const d = new Date(note.created_at)
    if (isToday(d)) return `${t('today')}, ${format(d, 'HH:mm', { locale })}`
    if (isYesterday(d)) return `${t('yesterday')}, ${format(d, 'HH:mm', { locale })}`
    return format(d, 'd MMM', { locale })
  }, [note.created_at, language, t])

  const availableTags = useMemo(() => {
    const merged = ['All', ...tags]
    return Array.from(new Set(merged))
  }, [tags])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  // Enable VirtualKeyboard API for Chromium browsers (Android Chrome, Edge)
  // https://mathix.dev/blog/fix-html-elements-on-top-of-the-ios-keyboard-using-html-css-js
  useEffect(() => {
    if ('virtualKeyboard' in navigator) {
      const vk = (navigator as any).virtualKeyboard
      vk.overlaysContent = true
    }
  }, [])

  // iOS workaround - calculate keyboard offset manually
  const updateKeyboardMetrics = useCallback(() => {
    const vv = window.visualViewport
    if (!vv || vv.height === 0) return

    const ih = window.innerHeight
    // Exact formula from the guide
    const offset = Math.max(0, ih - vv.height - vv.offsetTop)

    if (offset > 100) {
      setKeyboardHeight(offset)
    } else {
      setKeyboardHeight(0)
    }
  }, [])



  // iOS keyboard handling via visualViewport API (same as SearchBar)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    let timeoutId: number | undefined

    const scheduleUpdate = () => {
      updateKeyboardMetrics()
      requestAnimationFrame(updateKeyboardMetrics)
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
      timeoutId = window.setTimeout(updateKeyboardMetrics, 50)
    }

    viewport.addEventListener('resize', scheduleUpdate)
    viewport.addEventListener('scroll', scheduleUpdate)
    window.addEventListener('focusin', scheduleUpdate)
    window.addEventListener('focusout', scheduleUpdate)
    document.addEventListener('gesturechange', scheduleUpdate)

    return () => {
      viewport.removeEventListener('resize', scheduleUpdate)
      viewport.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('focusin', scheduleUpdate)
      window.removeEventListener('focusout', scheduleUpdate)
      document.removeEventListener('gesturechange', scheduleUpdate)
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
      document.body.style.height = ''
      document.body.style.overflow = ''
    }
  }, [updateKeyboardMetrics])


  // Share link mutation - always public
  const shareMutation = useMutation({
    mutationFn: () => api.createShareLink(note.id, true),
    onSuccess: (data) => {
      setIsSharing(false)
      hapticNotification('success')

      // Use inline query to share note
      switchInlineQuery(`share_note_${data.share_token}`, ['users', 'groups', 'channels'])

      // Close mini app to show inline query picker
      close()
    },
    onError: () => {
      setIsSharing(false)
      hapticNotification('error')
      showAlert('Не удалось создать ссылку')
    }
  })

  // Update note mutation
  const updateMutation = useMutation({
    mutationFn: () => api.updateNote(note.id, {
      content: editedContent,
      summary: editedSummary || undefined,
      tag: editedTag || 'All',
    }),
    onSuccess: (updatedNote) => {
      hapticNotification('success')
      setIsEditing(false)
      onUpdate?.(updatedNote)

      // Auto-sync to Notion if already synced
      if (canSync && syncStatus?.synced) {
        setTimeout(() => {
          setIsSyncing(true)
          syncMutation.mutate()
        }, 500)
      }
    },
    onError: () => {
      hapticNotification('error')
      showAlert('Не удалось сохранить изменения')
    }
  })

  const updateTagMutation = useMutation({
    mutationFn: (tag: string) => api.updateNote(note.id, { tag }),
    onSuccess: (updatedNote) => {
      hapticNotification('success')
      setEditedTag(updatedNote.tag || 'All')
      onUpdate?.(updatedNote)
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
    onError: () => {
      hapticNotification('error')
      showAlert('Failed to update tag')
    }
  })

  const createTagMutation = useMutation({
    mutationFn: (name: string) => api.createTag(name),
    onSuccess: ({ tag }) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setEditedTag(tag)
      if (!isEditing) {
        updateTagMutation.mutate(tag)
      }
    },
    onError: () => {
      hapticNotification('error')
      showAlert('Failed to create tag')
    }
  })

  // Sync status query
  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery({
    queryKey: ['syncStatus', note.id],
    queryFn: () => api.getNoteSyncStatus(note.id),
    enabled: canSync,
    staleTime: 30000, // 30 seconds
  })

  // Show toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type })
  }, [])

  // Sync note mutation
  const syncMutation = useMutation({
    mutationFn: () => api.syncNote(note.id, false),
    onSuccess: (result) => {
      setIsSyncing(false)
      if (result.status === 'success') {
        hapticNotification('success')
        showToast(t('syncSuccess'), 'success')
        refetchSyncStatus()
      } else if (result.status === 'skipped') {
        hapticImpact('light')
        showToast(t('syncSkipped'), 'info')
      } else {
        hapticNotification('error')
        showToast(result.error || t('syncError'), 'error')
      }
    },
    onError: (error) => {
      setIsSyncing(false)
      hapticNotification('error')
      showToast(t('syncError'), 'error')
      console.error('Sync failed:', error)
    }
  })

  // Handle sync button click
  const handleSync = useCallback(() => {
    if (!canSync || isSyncing) return

    hapticImpact('medium')
    setIsSyncing(true)
    syncMutation.mutate()
  }, [canSync, isSyncing, hapticImpact, syncMutation])

  const handleShareLink = () => {
    hapticImpact('medium')
    setIsSharing(true)
    shareMutation.mutate()
  }

  const handleCopyText = () => {
    hapticImpact('medium')

    let shareContent = ''
    if (note.summary) {
      shareContent = `📝 ${note.summary}`
    } else {
      shareContent = note.content
    }

    if (isVoice && note.duration_seconds) {
      shareContent += `\n\n🎤 Голосовая заметка (${formatDuration(note.duration_seconds)})`
    }

    shareContent += `\n\n📅 ${formattedDate}`

    shareText(shareContent)
  }

  const handleDelete = () => {
    hapticImpact('medium')
    showConfirm('Удалить заметку?', (confirmed) => {
      if (confirmed && onDelete) {
        hapticNotification('success')
        onDelete(note.id)
      }
    })
  }

  const handleEdit = () => {
    hapticImpact('light')

    // Use flushSync to update state synchronously, then focus immediately in the same user event
    flushSync(() => {
      setEditedContent(note.content)
      setEditedSummary(note.summary || '')
      setEditedTag(note.tag || 'All')
      setIsEditing(true)
      // Hide action bar immediately when starting to edit (before keyboard opens)
      setActionBarVisible(false)
      setActionBarTargetHeight(0)
      // Reset the flag so we can show action bar again after keyboard opens
      actionBarShownAfterKeyboardRef.current = false
    })
    // Focus the active tab's textarea immediately to open keyboard (must be in same event)
    // CRITICAL: On mobile, focus() must be called synchronously within the click handler
    // Using requestAnimationFrame or setTimeout breaks the user gesture context
    if (activeTab === 'summary' && note.summary) {
      summaryBlockRef.current?.focus()
    } else {
      fullContentBlockRef.current?.focus()
    }
  }

  // Retry mechanism: after entering edit mode, keep checking viewport for 3 seconds
  // This ensures action bar positions correctly even if keyboard opens slowly
  useEffect(() => {
    if (!isEditing) return

    updateKeyboardMetrics()

    // Check every 300ms for 3 seconds
    const interval = window.setInterval(updateKeyboardMetrics, 300)
    const timeout = setTimeout(() => clearInterval(interval), 3000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [isEditing, updateKeyboardMetrics])

  // Scroll both tabs to the top when entering edit mode
  useEffect(() => {
    if (!isEditing) return

    // Scroll summary tab to top
    const summaryParent = summaryBlockRef.current?.parentElement
    if (summaryParent) {
      summaryParent.scrollTop = 0
    }

    // Scroll full content tab to top
    const fullContentParent = fullContentBlockRef.current?.parentElement
    if (fullContentParent) {
      fullContentParent.scrollTop = 0
    }
  }, [isEditing])

  // Detect when keyboard starts opening and apply delay
  useEffect(() => {
    // When not editing, reset everything
    if (!isEditing) {
      setDelayedKeyboardHeight(0)
      keyboardOpeningStartTimeRef.current = 0
      actionBarShownAfterKeyboardRef.current = false
      setTimeout(() => {
        setActionBarVisible(true)
      }, 1200)
      return
    }

    // Keyboard is closed
    if (keyboardHeight === 0) {
      // Reset delayed height immediately when keyboard closes
      setDelayedKeyboardHeight(0)
      keyboardOpeningStartTimeRef.current = 0
      actionBarShownAfterKeyboardRef.current = false
      setTimeout(() => {
        setActionBarVisible(true)
      }, 1200)
      return
    }

    // Keyboard is opening or open (keyboardHeight > 0)
    const now = Date.now()

    // First time keyboard height becomes > 0 - record start time
    if (keyboardOpeningStartTimeRef.current === 0) {
      keyboardOpeningStartTimeRef.current = now
    }

    const timeSinceKeyboardStartedOpening = now - keyboardOpeningStartTimeRef.current

    if (timeSinceKeyboardStartedOpening < 1000) {
      // Still within 1 second delay - ignore this update but schedule for later
      const remainingDelay = 1000 - timeSinceKeyboardStartedOpening
      const delayTimer = setTimeout(() => {
        // Set target height
        setActionBarTargetHeight(keyboardHeight)
        setDelayedKeyboardHeight(keyboardHeight)
        // Show only if we haven't shown it yet
        if (!actionBarShownAfterKeyboardRef.current) {
          actionBarShownAfterKeyboardRef.current = true
          setTimeout(() => {
            setActionBarVisible(true)
          }, 1100)
        }
      }, remainingDelay)

      return () => {
        clearTimeout(delayTimer)
      }
    } else {
      // More than 1 second has passed - apply immediately
      setActionBarTargetHeight(keyboardHeight)
      setDelayedKeyboardHeight(keyboardHeight)
      // Show only if we haven't shown it yet
      if (!actionBarShownAfterKeyboardRef.current) {
        actionBarShownAfterKeyboardRef.current = true
        setTimeout(() => {
          setActionBarVisible(true)
        }, 500)
      }
    }
  }, [keyboardHeight, isEditing])

  const handleSave = () => {
    hapticImpact('medium')
    updateMutation.mutate()
  }

  const handleSelectTag = (tag: string) => {
    hapticImpact('light')
    setEditedTag(tag)
    setIsTagPickerOpen(false)
    if (!isEditing && tag !== (note.tag || 'All')) {
      updateTagMutation.mutate(tag)
    }
  }

  const handleCreateTag = () => {
    const raw = window.prompt(t('addTagPrompt'))
    if (!raw) return
    const name = raw.trim()
    if (!name) return
    createTagMutation.mutate(name)
  }

  const handleCancelEdit = () => {
    hapticImpact('light')
    setIsEditing(false)
    setEditedContent(note.content)
    setEditedSummary(note.summary || '')
    setEditedTag(note.tag || 'All')
    // Reset and show action bar when exiting edit mode
    setActionBarTargetHeight(0)
    setActionBarVisible(true)
  }

  // Auto-resize textarea helper
  const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }

  // When not editing, expand textareas to full content height so nothing is squeezed
  useEffect(() => {
    if (isEditing) return
    const expand = (el: HTMLTextAreaElement | null) => {
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    expand(summaryBlockRef.current)
    expand(fullContentBlockRef.current)
  }, [isEditing, editedContent, editedSummary, note.content, note.summary])

  // Get pixel Y of cursor in textarea content (using a mirror div)
  const getCursorPixelTop = useCallback((textarea: HTMLTextAreaElement): number => {
    const start = textarea.selectionStart
    const value = textarea.value
    if (start <= 0) return 0
    const style = getComputedStyle(textarea)
    let mirror = cursorMirrorRef.current
    if (!mirror) {
      mirror = document.createElement('div')
      mirror.setAttribute('aria-hidden', 'true')
      mirror.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;'
      document.body.appendChild(mirror)
      cursorMirrorRef.current = mirror
    }
    mirror.style.font = style.font
    mirror.style.fontSize = style.fontSize
    mirror.style.fontFamily = style.fontFamily
    mirror.style.lineHeight = style.lineHeight
    mirror.style.letterSpacing = style.letterSpacing
    mirror.style.padding = style.padding
    mirror.style.width = `${textarea.clientWidth}px`
    mirror.style.boxSizing = style.boxSizing
    mirror.textContent = value.substring(0, start)
    return mirror.offsetHeight
  }, [])

  // Scroll the content pane so the cursor stays visible; do not scroll the window
  const scrollCursorIntoView = useCallback((textarea: HTMLTextAreaElement) => {
    const scrollParent = textarea.parentElement
    if (!scrollParent || scrollParent.scrollHeight <= scrollParent.clientHeight) return

    const cursorTop = getCursorPixelTop(textarea)
    const lineHeight = 24
    const padding = 16
    const cursorBottom = cursorTop + lineHeight
    const scrollTop = scrollParent.scrollTop
    const visibleTop = scrollTop
    const visibleBottom = scrollTop + scrollParent.clientHeight

    if (cursorTop < visibleTop + padding) {
      scrollParent.scrollTop = Math.max(0, cursorTop - padding)
    } else if (cursorBottom > visibleBottom - padding) {
      scrollParent.scrollTop = cursorBottom - scrollParent.clientHeight + padding
    }
  }, [getCursorPixelTop])

  // Calculate content position for animation
  const [containerWidth, setContainerWidth] = useState(window.innerWidth)

  useEffect(() => {
    const updateWidth = () => {
      if (contentContainerRef.current) {
        setContainerWidth(contentContainerRef.current.offsetWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const contentPosition = useMemo(() => {
    if (!note.summary) return 0
    const baseOffset = activeTab === 'summary' ? 0 : -containerWidth
    return isEditing ? baseOffset : baseOffset + swipeOffset
  }, [note.summary, isEditing, activeTab, swipeOffset, containerWidth])

  const renderLinkPreviews = () => {
    if (urls.length === 0 || isEditing) return null

    return (
      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase mb-2 text-[var(--text-secondary)]">
          Ссылки ({urls.length})
        </h3>
        <div className="space-y-2">
          {urls.map((url, index) => (
            <LinkPreview
              key={index}
              url={url}
              onClick={() => hapticImpact('light')}
            />
          ))}
        </div>
      </div>
    )
  }

  // Handle swipe gestures for tab switching with content movement
  // Use native event listeners with { passive: false } to allow preventDefault
  useEffect(() => {
    const container = contentContainerRef.current
    if (!container || !note.summary || isEditing) return

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY }
      setSwipeOffset(0)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!swipeStartRef.current) return

      const touch = e.touches[0]
      const deltaX = touch.clientX - swipeStartRef.current.x
      const deltaY = Math.abs(touch.clientY - swipeStartRef.current.y)

      // Only process horizontal swipes
      if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > 5) {
        e.preventDefault()

        // Calculate offset based on current tab
        const containerWidth = container.offsetWidth || window.innerWidth
        let newOffset = deltaX

        // Limit movement based on active tab
        if (activeTab === 'summary') {
          // Can only swipe left (negative offset)
          newOffset = Math.max(-containerWidth, Math.min(0, deltaX))
        } else {
          // Can only swipe right (positive offset)
          newOffset = Math.max(0, Math.min(containerWidth, deltaX))
        }

        setSwipeOffset(newOffset)
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!swipeStartRef.current) {
        setSwipeOffset(0)
        return
      }

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - swipeStartRef.current.x
      const deltaY = Math.abs(touch.clientY - swipeStartRef.current.y)
      const containerWidth = container.offsetWidth || window.innerWidth
      const threshold = containerWidth * 0.3 // 30% of screen width

      // Only process horizontal swipes
      if (Math.abs(deltaX) > deltaY) {
        if (deltaX > threshold && activeTab === 'full') {
          // Swipe right enough: switch to summary
          hapticImpact('light')
          setActiveTab('summary')
        } else if (deltaX < -threshold && activeTab === 'summary') {
          // Swipe left enough: switch to full
          hapticImpact('light')
          setActiveTab('full')
        }
      }

      // Reset offset
      swipeStartRef.current = null
      setSwipeOffset(0)
    }

    // Add event listeners with { passive: false } for touchmove to allow preventDefault
    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [note.summary, isEditing, activeTab, hapticImpact])


  return (
    <motion.div
      className="min-h-screen bg-[var(--bg-secondary)]"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.2 }}
    >
      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      {/* Content — dvh automatically adjusts for keyboard */}
      <main
        className="pt-4 safe-area-top overflow-x-hidden flex flex-col"
        style={{
          height: '100dvh'
        }}
      >
        {/* Title and Date - collapse when editing */}
        <AnimatePresence initial={false}>
          {!isEditing && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{
                opacity: 1,
                height: 'auto',
                marginBottom: 'auto'
              }}
              exit={{
                opacity: 0,
                height: 0,
                marginBottom: 0
              }}
              transition={{
                opacity: { duration: 0.2, ease: 'easeIn' },
                height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                marginBottom: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
              }}
              style={{ overflow: 'hidden' }}
            >
              {/* Title */}
              {displayTitle && (
                <h1 className="text-[22px] font-bold mt-2 mb-1.5 leading-6 text-[var(--text-primary)] px-5 break-words line-clamp-4">
                  {displayTitle}
                </h1>
              )}

              {/* Date */}
              <p className="text-base font-medium mb-4 text-[var(--text-secondary)] px-5">
                {formattedDate}
              </p>

              <div className="px-5 pb-4">
                <button
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-full border text-sm font-medium"
                  style={{
                    backgroundColor: '#FFFFFF',
                    color: '#111827',
                    borderColor: 'rgba(17, 24, 39, 0.12)',
                  }}
                  onClick={() => setIsTagPickerOpen(true)}
                  disabled={updateTagMutation.isPending}
                >
                  <span>{t('tag')}</span>
                  <span>{editedTag || 'All'}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voice Player - show for voice notes with voice_url, hide when editing */}
        <AnimatePresence initial={false}>
          {isVoice && note.voice_url && note.duration_seconds && !isEditing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{
                opacity: 1,
                height: 'auto'
              }}
              exit={{
                opacity: 0,
                height: 0
              }}
              transition={{
                opacity: { duration: 0.2, ease: 'easeIn' },
                height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
              }}
              style={{ overflow: 'hidden' }}
            >
              <VoicePlayer
                voiceUrl={note.voice_url}
                duration={note.duration_seconds}
                className="px-5"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Images gallery - show at the top if there are images */}
        <AnimatePresence initial={false}>
          {hasImages && !isEditing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{
                opacity: 1,
                height: 'auto'
              }}
              exit={{
                opacity: 0,
                height: 0
              }}
              transition={{
                opacity: { duration: 0.2, ease: 'easeIn' },
                height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
              }}
              style={{ overflow: 'hidden' }}
            >
              <ImageGallery className="px-5" images={note.images!} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs: AI Summary | Full Text - animate upward when entering edit mode */}
        <motion.div
          layout
          transition={{
            layout: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
          }}
        >
          <NoteTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            hasSummary={!!note.summary}
          />
        </motion.div>

        {/* Tab content with swipe gesture support; each tab scrolls independently */}
        <motion.div
          ref={contentContainerRef}
          className="relative overflow-hidden flex-1 min-h-0"
          style={{ touchAction: 'pan-y' }}
          layout
          transition={{
            layout: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
          }}
        >
          <motion.div
            className="flex h-full"
            animate={{
              x: contentPosition
            }}
            transition={{
              type: swipeOffset === 0 ? 'spring' : 'tween',
              stiffness: 300,
              damping: 30,
              duration: swipeOffset === 0 ? undefined : 0
            }}
            style={{
              width: note.summary ? '200%' : '100%',
              height: '100%',
            }}
          >
            {/* Summary tab — scroll only inside this pane */}
            {note.summary && (
              <div className="w-1/2 flex-shrink-0 flex flex-col min-h-0 h-full">
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden hide-scrollbar px-5">
                  <div
                    className="min-h-full pt-6"
                    style={{
                      paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))'
                    }}
                  >
                  <textarea
                    ref={summaryBlockRef}
                    readOnly={!isEditing}
                    tabIndex={isEditing ? 0 : -1}
                    value={editedSummary}
                    onChange={(e) => {
                      setEditedSummary(e.target.value)
                      autoResizeTextarea(e.target)
                      requestAnimationFrame(() => scrollCursorIntoView(e.target))
                    }}
                    className={`w-full text-base leading-relaxed bg-transparent outline-none resize-none selectable-text overflow-hidden text-[var(--text-primary)] whitespace-pre-wrap ${
                      !isEditing ? 'cursor-default' : ''
                    }`}
                    style={{ scrollMarginBottom: 100 }}
                    placeholder={t('noSummary')}
                    aria-readonly={!isEditing}
                  />
                  {renderLinkPreviews()}
                  </div>
                </div>
              </div>
            )}

            {/* Full text tab — scroll only inside this pane */}
            <div className={note.summary ? "w-1/2 flex-shrink-0 flex flex-col min-h-0 h-full" : "w-full flex flex-col min-h-0 h-full"}>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden hide-scrollbar px-5 pt-6">
                <div
                  className="min-h-full"
                  style={{
                    paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))'
                  }}
                >
                <textarea
                  ref={fullContentBlockRef}
                  readOnly={!isEditing}
                  tabIndex={isEditing ? 0 : -1}
                  value={editedContent}
                  onChange={(e) => {
                    setEditedContent(e.target.value)
                    autoResizeTextarea(e.target)
                    requestAnimationFrame(() => scrollCursorIntoView(e.target))
                  }}
                  className={`w-full text-base leading-relaxed bg-transparent outline-none resize-none selectable-text overflow-hidden text-[var(--text-primary)] whitespace-pre-wrap ${
                    !isEditing ? 'cursor-default' : ''
                  }`}
                  style={{ scrollMarginBottom: 100 }}
                  placeholder="Введите текст заметки..."
                  aria-readonly={!isEditing}
                />
              {renderLinkPreviews()}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </main>

      <AnimatePresence>
        {isTagPickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/35 flex items-end p-3"
            onClick={() => setIsTagPickerOpen(false)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              className="w-full rounded-2xl p-4"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {t('selectTag')}
                </h3>
                <button
                  className="h-8 px-3 rounded-full border text-sm"
                  style={{
                    borderColor: 'var(--separator)',
                    color: 'var(--text-secondary)',
                  }}
                  onClick={handleCreateTag}
                  disabled={createTagMutation.isPending}
                >
                  + {t('addTag')}
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    className="h-9 px-4 rounded-full text-sm font-medium whitespace-nowrap border"
                    style={{
                      backgroundColor: '#FFFFFF',
                      color: editedTag === tag ? '#111827' : '#4B5563',
                      borderColor: editedTag === tag ? '#111827' : 'rgba(17, 24, 39, 0.12)',
                    }}
                    onClick={() => handleSelectTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {typeof document !== 'undefined' && createPortal(
        <>
          {/* Bottom fade gradient - uses secondary background */}
          <motion.div
            className="bottom-fade-secondary"
            style={{
              bottom: delayedKeyboardHeight > 0 ? delayedKeyboardHeight : 0
            }}
            initial={{ opacity: 1 }}
            animate={{
              opacity: actionBarVisible ? 1 : 0
            }}
            transition={{
              opacity: {
                duration: actionBarVisible ? 0.4 : 0.1,
                ease: actionBarVisible ? [0.4, 0, 0.2, 1] : 'linear'
              }
            }}
          />

          {/* Floating action bar */}
          <NoteActionBar
            isEditing={isEditing}
            isSyncing={isSyncing}
            canSync={canSync}
            syncStatus={syncStatus}
            isSharing={isSharing}
            isVisible={actionBarVisible}
            onEdit={handleEdit}
            onSave={handleSave}
            onCancel={handleCancelEdit}
            onSync={handleSync}
            onShare={handleShareLink}
            onCopy={handleCopyText}
            onDelete={onDelete ? handleDelete : undefined}
            isSaving={updateMutation.isPending}
            keyboardHeight={actionBarTargetHeight}
          />
        </>,
        document.body
      )}
    </motion.div>
  )
}
