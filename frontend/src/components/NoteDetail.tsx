import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, isToday, isYesterday } from 'date-fns'
import { enUS, ru } from 'date-fns/locale'
import { useMutation, useQuery } from '@tanstack/react-query'
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
  onBack?: () => void
  onDelete?: (id: string) => void
  onUpdate?: (note: Note) => void
}

export const NoteDetail = ({ note, onDelete, onUpdate }: NoteDetailProps) => {
  const { hapticImpact, hapticNotification, showConfirm, shareText, showAlert, switchInlineQuery, close } = useTelegram()
  const { subscription } = useSubscription()
  const { t, language } = useI18n()
  const locale = language === 'ru' ? ru : enUS
  const [isSharing, setIsSharing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(note.content)
  const [editedSummary, setEditedSummary] = useState(note.summary || '')
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [viewportOffset, setViewportOffset] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [activeTab, setActiveTab] = useState<'summary' | 'full'>(() => (note.summary ? 'summary' : 'full'))
  const [swipeOffset, setSwipeOffset] = useState(0)
  const contentContainerRef = useRef<HTMLDivElement>(null)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)

  // Default to summary tab when note has summary, otherwise full text; reset when note changes
  useEffect(() => {
    setActiveTab(note.summary ? 'summary' : 'full')
  }, [note.id, note.summary])

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

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  // Handle iOS keyboard using visualViewport API
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const handleResize = () => {
      const windowHeight = window.innerHeight
      const viewportHeight = viewport.height
      const offsetTop = viewport.offsetTop
      const newKeyboardHeight = windowHeight - viewportHeight - offsetTop

      if (newKeyboardHeight > 100) {
        setKeyboardHeight(newKeyboardHeight)
        // Calculate viewport offset to keep action bar above keyboard
        // When viewport scrolls, we need to account for the offset
        setViewportOffset(offsetTop)
        document.body.style.height = `${viewportHeight}px`
        document.body.style.overflow = 'hidden'
      } else {
        setKeyboardHeight(0)
        setViewportOffset(0)
        document.body.style.height = ''
        document.body.style.overflow = ''
      }
    }

    const handleScroll = () => {
      // Update on scroll to keep action bar in correct position
      handleResize()
    }

    viewport.addEventListener('resize', handleResize)
    viewport.addEventListener('scroll', handleScroll)

    return () => {
      viewport.removeEventListener('resize', handleResize)
      viewport.removeEventListener('scroll', handleScroll)
      document.body.style.height = ''
      document.body.style.overflow = ''
    }
  }, [])

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
      summary: editedSummary || undefined
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
    setEditedContent(note.content)
    setEditedSummary(note.summary || '')
    setIsEditing(true)
  }

  const handleSave = () => {
    hapticImpact('medium')
    updateMutation.mutate()
  }

  const handleCancelEdit = () => {
    hapticImpact('light')
    setIsEditing(false)
    setEditedContent(note.content)
    setEditedSummary(note.summary || '')
  }

  // Auto-resize textarea helper
  const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }

  // Scroll cursor into view when editing
  const scrollCursorIntoView = (textarea: HTMLTextAreaElement) => {
    const rect = textarea.getBoundingClientRect()
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const actionBarSpace = 80
    const availableBottom = viewportHeight - actionBarSpace

    if (rect.bottom > availableBottom) {
      const scrollAmount = rect.bottom - availableBottom + 20
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' })
    }
  }

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
    if (!note.summary || isEditing) return 0
    const baseOffset = activeTab === 'summary' ? 0 : -containerWidth
    return baseOffset + swipeOffset
  }, [note.summary, isEditing, activeTab, swipeOffset, containerWidth])

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

      {/* Content */}
      <main
        className="pt-4 safe-area-top hide-scrollbar overflow-y-auto overflow-x-hidden"
        style={{
          paddingBottom: isEditing && keyboardHeight > 0
            ? keyboardHeight + 80
            : 'calc(100px + env(safe-area-inset-bottom, 0px))'
        }}
      >
        {/* Title */}
        {displayTitle && (
          <h1 className="text-[22px] font-bold mt-2 mb-1.5 leading-6 text-[var(--text-primary)] px-5 break-words">
            {displayTitle}
          </h1>
        )}

        {/* Date */}
        <p className="text-base font-medium mb-5 text-[var(--text-secondary)] px-5">
          {formattedDate}
        </p>

        {/* Voice Player - show for voice notes with voice_url */}
        {isVoice && note.voice_url && note.duration_seconds && !isEditing && (
          <VoicePlayer
            voiceUrl={note.voice_url}
            duration={note.duration_seconds}
            className="px-5"
          />
        )}

        {/* Images gallery - show at the top if there are images */}
        {hasImages && !isEditing && (
          <ImageGallery className="px-5" images={note.images!} />
        )}

        {/* Tabs: AI Summary | Full Text */}
        <NoteTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasSummary={!!note.summary}
        />

        {/* Tab content with swipe gesture support and horizontal movement */}
        <div
          ref={contentContainerRef}
          className="relative overflow-hidden"
          style={{ touchAction: 'pan-y' }}
        >
          <motion.div
            className="flex"
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
            }}
          >
            {/* Summary tab content */}
            {note.summary && (
              <div className="w-1/2 flex-shrink-0 px-5">
                {isEditing ? (
                  <textarea
                    value={editedSummary}
                    onChange={(e) => {
                      setEditedSummary(e.target.value)
                      autoResizeTextarea(e.target)
                      scrollCursorIntoView(e.target)
                    }}
                    className="w-full text-base leading-relaxed bg-transparent outline-none resize-none selectable-text overflow-hidden text-[var(--text-primary)]"
                    style={{ scrollMarginBottom: 100 }}
                    placeholder={t('noSummary')}
                  />
                ) : (
                  <p className="text-base leading-relaxed whitespace-pre-wrap selectable-text text-[var(--text-primary)]">
                    {note.summary}
                  </p>
                )}
              </div>
            )}
            
            {/* Full text tab content */}
            <div className={note.summary ? "w-1/2 flex-shrink-0 px-5" : "w-full px-5"}>
              {isEditing ? (
                <textarea
                  value={editedContent}
                  onChange={(e) => {
                    setEditedContent(e.target.value)
                    autoResizeTextarea(e.target)
                    scrollCursorIntoView(e.target)
                  }}
                  className="w-full text-base leading-relaxed bg-transparent outline-none resize-none selectable-text overflow-hidden text-[var(--text-primary)]"
                  style={{ scrollMarginBottom: 100 }}
                  placeholder="Введите текст заметки..."
                />
              ) : (
                <p className="text-base leading-relaxed whitespace-pre-wrap selectable-text text-[var(--text-primary)]">
                  {note.content}
                </p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Link previews */}
        {urls.length > 0 && !isEditing && (
          <div className="mt-6 px-5">
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
        )}
      </main>

      {/* Bottom fade gradient */}
      <motion.div
        className="bottom-fade"
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          bottom: keyboardHeight > 0 ? keyboardHeight : 0
        }}
        transition={{
          delay: 0.15,
          duration: 0.25,
          ease: [0.25, 0.46, 0.45, 0.94]
        }}
      />

      {/* Floating action bar */}
      <NoteActionBar
        isEditing={isEditing}
        isSyncing={isSyncing}
        canSync={canSync}
        syncStatus={syncStatus}
        isSharing={isSharing}
        onEdit={handleEdit}
        onSave={handleSave}
        onCancel={handleCancelEdit}
        onSync={handleSync}
        onShare={handleShareLink}
        onCopy={handleCopyText}
        onDelete={onDelete ? handleDelete : undefined}
        isSaving={updateMutation.isPending}
        keyboardHeight={keyboardHeight}
        viewportOffset={viewportOffset}
      />
    </motion.div>
  )
}
