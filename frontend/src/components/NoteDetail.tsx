import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useMutation } from '@tanstack/react-query'
import { Note, api } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'

interface NoteDetailProps {
  note: Note
  onBack?: () => void
  onDelete?: (id: string) => void
  onUpdate?: (note: Note) => void
}

export const NoteDetail = ({ note, onDelete, onUpdate }: NoteDetailProps) => {
  const { hapticImpact, hapticNotification, showConfirm, shareText, showAlert, switchInlineQuery, close } = useTelegram()
  const [isSharing, setIsSharing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(note.content)
  const [editedSummary, setEditedSummary] = useState(note.summary || '')
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null)
  const summaryTextareaRef = useRef<HTMLTextAreaElement>(null)

  const isVoice = note.source === 'voice'
  const icon = isVoice ? '🎤' : '📝'

  const date = new Date(note.created_at)
  const formattedDate = format(date, "d MMMM yyyy 'в' HH:mm", { locale: ru })

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
      const newKeyboardHeight = windowHeight - viewportHeight - viewport.offsetTop

      if (newKeyboardHeight > 100) {
        setKeyboardHeight(newKeyboardHeight)
        document.body.style.height = `${viewportHeight}px`
        document.body.style.overflow = 'hidden'
      } else {
        setKeyboardHeight(0)
        document.body.style.height = ''
        document.body.style.overflow = ''
      }
    }

    viewport.addEventListener('resize', handleResize)
    viewport.addEventListener('scroll', handleResize)

    return () => {
      viewport.removeEventListener('resize', handleResize)
      viewport.removeEventListener('scroll', handleResize)
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
    },
    onError: () => {
      hapticNotification('error')
      showAlert('Не удалось сохранить изменения')
    }
  })

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

  return (
    <motion.div
      className="min-h-screen"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.2 }}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Content */}
      <main className="px-4 pt-4 safe-area-top" style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Meta info */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{icon}</span>
          <div>
            <span className={`badge ${isVoice ? 'badge-voice' : 'badge-text'}`}>
              {isVoice ? 'Голосовая заметка' : 'Текстовая заметка'}
            </span>
            {isVoice && note.duration_seconds && (
              <span
                className="text-sm ml-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                {formatDuration(note.duration_seconds)}
              </span>
            )}
          </div>
        </div>

        {/* Date */}
        <p
          className="text-sm mb-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          {formattedDate}
        </p>

        {/* Summary */}
        {(note.summary || isEditing) && (
          <div className="mb-6">
            <h3
              className="text-xs font-semibold uppercase mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              Краткое содержание
            </h3>
            <div
              className="ios-card p-4"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              {isEditing ? (
                <textarea
                  ref={summaryTextareaRef}
                  value={editedSummary}
                  onChange={(e) => {
                    setEditedSummary(e.target.value)
                    autoResizeTextarea(e.target)
                  }}
                  className="w-full text-base leading-relaxed bg-transparent outline-none resize-none selectable-text overflow-hidden"
                  style={{ color: 'var(--text-primary)' }}
                  placeholder="Введите краткое содержание..."
                />
              ) : (
                <p
                  className="text-base leading-relaxed whitespace-pre-wrap selectable-text"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {note.summary}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Full content */}
        <div>
          <h3
            className="text-xs font-semibold uppercase mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            {note.summary ? 'Полный текст' : 'Содержание'}
          </h3>
          <div
            className="ios-card p-4"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            {isEditing ? (
              <textarea
                ref={contentTextareaRef}
                value={editedContent}
                onChange={(e) => {
                  setEditedContent(e.target.value)
                  autoResizeTextarea(e.target)
                }}
                className="w-full text-base leading-relaxed bg-transparent outline-none resize-none selectable-text overflow-hidden"
                style={{ color: 'var(--text-primary)' }}
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
        </div>
      </main>

      {/* Bottom fade gradient */}
      <div
        className="bottom-fade"
        style={{
          bottom: keyboardHeight > 0 ? keyboardHeight : 0
        }}
      />

      {/* Floating action bar */}
      <div className="fixed left-0 right-0 z-[100] h-[48px] flex items-center justify-center bottom-[calc(12px+env(safe-area-inset-bottom,0px))]">
        <motion.div
          className="liquid-glass--action-bar relative h-[48px] flex items-center justify-center overflow-hidden"
          animate={{
            width: isEditing ? 104 : 216
          }}
          transition={{
            duration: 0.3,
            ease: [0.4, 0, 0.2, 1]
          }}
          style={{
            bottom: keyboardHeight > 0 ? keyboardHeight + 12 : undefined
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
      </div>
    </motion.div>
  )
}
