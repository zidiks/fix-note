import clsx from "clsx";
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, isToday, isYesterday } from 'date-fns'
import { enUS, ru } from 'date-fns/locale'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Note, api } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'
import { useSubscription } from '../stores/subscription'
import { useI18n } from '../i18n'

// URL regex pattern
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi

// Extract URLs from text
const extractUrls = (text: string): string[] => {
  const matches = text.match(URL_REGEX)
  if (!matches) return []
  // Remove duplicates and clean trailing punctuation
  return [...new Set(matches.map(url => url.replace(/[.,;:!?)]+$/, '')))]
}

// Get domain from URL
const getDomain = (url: string): string => {
  try {
    const domain = new URL(url).hostname.replace('www.', '')
    return domain
  } catch {
    return url
  }
}

// Get favicon URL for a domain
const getFaviconUrl = (url: string): string => {
  const domain = getDomain(url)
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
}

// Link preview component
const LinkPreview = ({ url, onClick }: { url: string; onClick: () => void }) => {
  const domain = getDomain(url)
  const displayUrl = url.length > 50 ? url.substring(0, 50) + '...' : url

  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault()
        onClick()
        window.open(url, '_blank', 'noopener,noreferrer')
      }}
      className="flex items-center gap-3 p-3 rounded-xl transition-all"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--separator)'
      }}
      whileTap={{ scale: 0.98 }}
    >
      <img
        src={getFaviconUrl(url)}
        alt=""
        className="w-6 h-6 rounded"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none'
        }}
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: 'var(--accent)' }}
        >
          {domain}
        </p>
        <p
          className="text-xs truncate"
          style={{ color: 'var(--text-secondary)' }}
        >
          {displayUrl}
        </p>
      </div>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </motion.a>
  )
}

// Image gallery component
const ImageGallery = ({ images }: { images: string[] }) => {
  const [selectedImage, setSelectedImage] = useState<number | null>(null)

  if (!images || images.length === 0) return null

  const gridCols = images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <>
      {/* Gallery grid */}
      <div className={`grid ${gridCols} gap-2 mb-6`}>
        {images.map((img, index) => (
          <motion.div
            key={index}
            className="relative aspect-square rounded-xl overflow-hidden cursor-pointer"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedImage(index)}
          >
            <img
              src={img}
              alt={`Image ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </motion.div>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedImage !== null && (
          <motion.div
            className="fixed inset-0 z-[300] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/90"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Image */}
            <motion.img
              src={images[selectedImage]}
              alt=""
              className="relative max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            />

            {/* Close button */}
            <motion.button
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white"
              onClick={() => setSelectedImage(null)}
              whileTap={{ scale: 0.9 }}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </motion.button>

            {/* Navigation arrows */}
            {images.length > 1 && (
              <>
                {selectedImage > 0 && (
                  <motion.button
                    className="absolute left-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedImage(prev => (prev !== null ? prev - 1 : 0))
                    }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </motion.button>
                )}
                {selectedImage < images.length - 1 && (
                  <motion.button
                    className="absolute right-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedImage(prev => (prev !== null ? prev + 1 : 0))
                    }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </motion.button>
                )}
              </>
            )}

            {/* Image counter */}
            {images.length > 1 && (
              <motion.div
                className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
              >
                {selectedImage + 1} / {images.length}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// Toast notification component
const SyncToast = ({ message, type, onClose }: {
  message: string
  type: 'success' | 'error' | 'info'
  onClose: () => void
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  const iconMap = {
    success: '✓',
    error: '✕',
    info: '↻'
  }

  const colorMap = {
    success: 'rgba(52, 199, 89, 0.9)',
    error: 'rgba(255, 59, 48, 0.9)',
    info: 'rgba(0, 122, 255, 0.9)'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -30, scale: 0.9 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed top-4 left-4 right-4 z-[200] safe-area-top"
    >
      <div
        className="mx-auto max-w-sm rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
        }}
      >
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: colorMap[type] }}
        >
          {iconMap[type]}
        </span>
        <span style={{ color: 'var(--text-primary)' }} className="text-sm font-medium flex-1">
          {message}
        </span>
      </div>
    </motion.div>
  )
}

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
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null)
  const summaryTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Default to summary tab when note has summary, otherwise full text; reset when note changes
  useEffect(() => {
    setActiveTab(note.summary ? 'summary' : 'full')
  }, [note.id, note.summary])

  // Check if sync is enabled for user
  const canSync = subscription?.limits.sync_enabled ?? false

  const isVoice = note.source === 'voice'
  const hasImages = note.images && note.images.length > 0
  const icon = hasImages ? '🖼️' : isVoice ? '🎤' : '📝'

  // Display title: AI-generated or first line of summary/content
  const displayTitle = note.title?.trim() ||
    (note.summary ? note.summary.split('\n')[0].trim() : null) ||
    note.content.split('\n')[0].trim() ||
    null

  // Extract URLs from content
  const urls = useMemo(() => extractUrls(note.content), [note.content])

  const date = new Date(note.created_at)
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
    // Focus on content textarea and auto-resize after state update
    setTimeout(() => {
      if (contentTextareaRef.current) {
        autoResizeTextarea(contentTextareaRef.current)
        contentTextareaRef.current.focus()
      }
      if (summaryTextareaRef.current) {
        autoResizeTextarea(summaryTextareaRef.current)
      }
    }, 50)
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

  // Auto-resize textareas
  const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }

  // Scroll cursor into view when editing
  const scrollCursorIntoView = (textarea: HTMLTextAreaElement) => {
    // Get the textarea's bounding rect
    const rect = textarea.getBoundingClientRect()
    const viewportHeight = window.visualViewport?.height || window.innerHeight

    // Calculate available space (viewport minus action bar height ~70px)
    const actionBarSpace = 80
    const availableBottom = viewportHeight - actionBarSpace

    // If textarea bottom is below available space, scroll to show it
    if (rect.bottom > availableBottom) {
      const scrollAmount = rect.bottom - availableBottom + 20
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' })
    }
  }

  return (
    <motion.div
      className="min-h-screen"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.2 }}
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <SyncToast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      {/* Content */}
      <main
        className="px-4 pt-4 safe-area-top hide-scrollbar overflow-y-auto"
        style={{
          paddingBottom: isEditing && keyboardHeight > 0
            ? keyboardHeight + 80
            : 'calc(100px + env(safe-area-inset-bottom, 0px))'
        }}
      >
        {/* Title */}
        {displayTitle && (
          <h1
            className="text-[22px] font-bold mt-2 mb-1.5 leading-tight leading-6"
            style={{ color: 'var(--text-primary)' }}
          >
            {displayTitle}
          </h1>
        )}

        {/* Date */}
        <p
          className="text-base font-medium mb-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          {formattedDate}
        </p>

        {/* Images gallery - show at the top if there are images */}
        {hasImages && !isEditing && (
          <ImageGallery images={note.images!} />
        )}

        {/* Tabs: AI Summary | Full Text */}
        <div className="mb-4">
          <div className="flex border-b" style={{ borderColor: 'var(--separator)' }}>
            <button
              type="button"
              onClick={() => {
                hapticImpact('light')
                setActiveTab('summary')
              }}
              className="flex-1 pb-3 pt-1 text-center text-base font-medium transition-colors"
              style={{
                color: activeTab === 'summary' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === 'summary' ? 'var(--accent)' : 'transparent',
                marginBottom: -1,
              }}
            >
              {t('tabAiSummary')}
            </button>
            <button
              type="button"
              onClick={() => {
                hapticImpact('light')
                setActiveTab('full')
              }}
              className="flex-1 pb-3 pt-1 text-center text-base font-medium transition-colors"
              style={{
                color: activeTab === 'full' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === 'full' ? 'var(--accent)' : 'transparent',
                marginBottom: -1,
              }}
            >
              {t('tabFullText')}
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div
          className="ios-card p-4"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {activeTab === 'summary' ? (
            isEditing ? (
              <textarea
                ref={summaryTextareaRef}
                value={editedSummary}
                onChange={(e) => {
                  setEditedSummary(e.target.value)
                  autoResizeTextarea(e.target)
                  scrollCursorIntoView(e.target)
                }}
                className="w-full text-base leading-relaxed bg-transparent outline-none resize-none selectable-text overflow-hidden"
                style={{ color: 'var(--text-primary)', scrollMarginBottom: 100 }}
                placeholder={t('noSummary')}
              />
            ) : note.summary ? (
              <p
                className="text-base leading-relaxed whitespace-pre-wrap selectable-text"
                style={{ color: 'var(--text-primary)' }}
              >
                {note.summary}
              </p>
            ) : (
              <p
                className="text-base leading-relaxed"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {t('noSummary')}
              </p>
            )
          ) : isEditing ? (
            <textarea
              ref={contentTextareaRef}
              value={editedContent}
              onChange={(e) => {
                setEditedContent(e.target.value)
                autoResizeTextarea(e.target)
                scrollCursorIntoView(e.target)
              }}
              className="w-full text-base leading-relaxed bg-transparent outline-none resize-none selectable-text overflow-hidden"
              style={{ color: 'var(--text-primary)', scrollMarginBottom: 100 }}
              placeholder="Введите текст заметки..."
            />
          ) : (
            <p
              className="text-base leading-relaxed whitespace-pre-wrap selectable-text"
              style={{ color: 'var(--text-primary)' }}
            >
              {note.content}
            </p>
          )}
        </div>

        {/* Link previews */}
        {urls.length > 0 && !isEditing && (
          <div className="mt-6">
            <h3
              className="text-xs font-semibold uppercase mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
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
      <motion.div
        className="fixed left-0 right-0 z-[100] h-[48px] flex items-center justify-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{
          opacity: 1,
          y: viewportOffset > 0 ? -viewportOffset : 0
        }}
        transition={{
          delay: 0.15,
          duration: 0.25,
          ease: [0.25, 0.46, 0.45, 0.94]
        }}
        style={{
          position: 'fixed',
          bottom: keyboardHeight > 0 
            ? `${keyboardHeight + 12}px` 
            : `calc(12px + env(safe-area-inset-bottom, 0px))`
        }}
      >
        <motion.div
          className="liquid-glass--action-bar relative h-[48px] flex items-center justify-center overflow-hidden"
          animate={{
            width: isEditing ? 104 : 268
          }}
          transition={{
            duration: 0.3,
            ease: [0.4, 0, 0.2, 1]
          }}
        >
          <div className="liquid-glass__frost" />
          <div className="liquid-glass__gradient-border" />
          <div className="liquid-glass__content liquid-glass__content--actions">
            <AnimatePresence mode="wait" initial={false}>
              {isEditing ? (
                /* Edit mode - Save button */
                <motion.div
                  key="edit-actions"
                  className="flex items-center justify-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                >
                  {/* Cancel button */}
                  <button
                    onClick={handleCancelEdit}
                    className="action-bar-button"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>

                  {/* Save button */}
                  <button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="action-bar-button action-bar-button--accent"
                  >
                    {updateMutation.isPending ? (
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                </motion.div>
              ) : (
                /* View mode - Action buttons */
                <motion.div
                  key="view-actions"
                  className="flex items-center justify-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                >
                  {/* Edit button */}
                                  <button
                                    onClick={handleEdit}
                                    className="action-bar-button"
                                  >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                  </button>

                                  {/* Sync button - only for Pro/Ultra users with integration */}
                                  {(
                                    <button
                                      onClick={handleSync}
                                      disabled={isSyncing}
                                      className={clsx(
                                        `action-bar-button transition easy-in-out ${syncStatus?.synced ? 'action-bar-button--synced' : ''}`,
                                        { 'pointer-events-none opacity-30': !(canSync && syncStatus?.has_integration) }
                                      )}
                                      title={t('syncNote')}
                                    >
                                      {isSyncing ? (
                                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                          <path d="M23 4V10H17"/>
                                          <path d="M1 20V14H7"/>
                                          <path d="M3.51 9A9 9 0 0 1 20.49 9L23 11.5"/>
                                          <path d="M20.49 15A9 9 0 0 1 3.51 15L1 12.5"/>
                                        </svg>
                                      )}
                                    </button>
                                  )}

                                  {/* Share button */}
                  <button
                    onClick={handleShareLink}
                    disabled={isSharing}
                    className="action-bar-button"
                  >
                    {isSharing ? (
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                    )}
                  </button>

                  {/* Copy button */}
                  <button
                    onClick={handleCopyText}
                    className="action-bar-button"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>

                  {/* Delete button */}
                  {onDelete && (
                    <button
                      onClick={handleDelete}
                      className="action-bar-button action-bar-button--destructive"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  )}
                </motion.div>
                )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
