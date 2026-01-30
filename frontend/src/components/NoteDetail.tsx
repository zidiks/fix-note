import { useState } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useMutation } from '@tanstack/react-query'
import { Note, api } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'

interface NoteDetailProps {
  note: Note
  onBack?: () => void
  onDelete?: (id: string) => void
}

export const NoteDetail = ({ note, onDelete }: NoteDetailProps) => {
  const { hapticImpact, hapticNotification, showConfirm, shareText, showAlert } = useTelegram()
  const [isSharing, setIsSharing] = useState(false)

  const isVoice = note.source === 'voice'
  const icon = isVoice ? '🎤' : '📝'

  const date = new Date(note.created_at)
  const formattedDate = format(date, "d MMMM yyyy 'в' HH:mm", { locale: ru })

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  // Share link mutation - always public
  const shareMutation = useMutation({
    mutationFn: () => api.createShareLink(note.id, true),
    onSuccess: (data) => {
      setIsSharing(false)
      hapticNotification('success')
      
      // Copy link to clipboard and open Telegram share
      const shareLink = data.share_url
      const shareMessage = `📝 ${note.summary || note.content.slice(0, 100)}\n\n${shareLink}`
      
      // Copy to clipboard first
      navigator.clipboard?.writeText(shareMessage).then(() => {
        // Then open Telegram forward dialog
        const botUsername = 'fixnote_bot'
        const startParam = data.share_token
        const telegramLink = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${botUsername}?startapp=${startParam}`)}&text=${encodeURIComponent(note.summary || 'Заметка из FixNote')}`
        
        window.open(telegramLink, '_blank')
      })
    },
    onError: () => {
      setIsSharing(false)
      hapticNotification('error')
      showAlert('Не удалось создать ссылку')
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

  return (
    <motion.div
      className="min-h-screen"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.2 }}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Header - без кнопки назад, используем Telegram BackButton */}
      <header
        className="sticky top-0 z-50 safe-area-top"
        style={{
          backgroundColor: 'var(--bg-primary)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h1 
            className="text-lg font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            Заметка
          </h1>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Share link button */}
            <button
              onClick={handleShareLink}
              disabled={isSharing}
              className="p-2 haptic-tap rounded-full"
              style={{ color: 'var(--accent)' }}
            >
              {isSharing ? (
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              )}
            </button>

            {/* Copy text button */}
            <button
              onClick={handleCopyText}
              className="p-2 haptic-tap rounded-full"
              style={{ color: 'var(--accent)' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>

            {/* Delete button */}
            {onDelete && (
              <button
                onClick={handleDelete}
                className="p-2 haptic-tap rounded-full"
                style={{ color: 'var(--destructive)' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-4 pb-8 safe-area-bottom">
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
        {note.summary && (
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
              <p
                className="text-base leading-relaxed whitespace-pre-wrap"
                style={{ color: 'var(--text-primary)' }}
              >
                {note.summary}
              </p>
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
            <p
              className="text-base leading-relaxed whitespace-pre-wrap"
              style={{ color: 'var(--text-primary)' }}
            >
              {note.content}
            </p>
          </div>
        </div>

        {/* Share link button (bottom) */}
        <motion.button
          onClick={handleShareLink}
          disabled={isSharing}
          className="w-full mt-6 py-3 px-4 rounded-xl font-semibold haptic-tap flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'white'
          }}
          whileTap={{ scale: 0.98 }}
        >
          {isSharing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Создание ссылки...
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Поделиться ссылкой
            </>
          )}
        </motion.button>
      </main>
    </motion.div>
  )
}
