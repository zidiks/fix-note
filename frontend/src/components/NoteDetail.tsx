import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Note } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'

interface NoteDetailProps {
  note: Note
  onBack: () => void
  onDelete?: (id: string) => void
}

export const NoteDetail = ({ note, onBack, onDelete }: NoteDetailProps) => {
  const { hapticImpact, hapticNotification, showConfirm, shareText } = useTelegram()

  const isVoice = note.source === 'voice'
  const icon = isVoice ? '🎤' : '📝'

  // Format date
  const date = new Date(note.created_at)
  const formattedDate = format(date, "d MMMM yyyy 'в' HH:mm", { locale: ru })

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const handleShare = () => {
    hapticImpact('medium')
    
    // Prepare share text
    let shareContent = ''
    
    if (note.summary) {
      shareContent = `📝 ${note.summary}`
    } else {
      shareContent = note.content
    }
    
    // Add source info
    if (isVoice && note.duration_seconds) {
      shareContent += `\n\n🎤 Голосовая заметка (${formatDuration(note.duration_seconds)})`
    }
    
    shareContent += `\n\n📅 ${formattedDate}`
    
    // Share via Telegram
    shareText(shareContent)
  }

  const handleDelete = () => {
    hapticImpact('medium')
    showConfirm('Удалить заметку?', (confirmed) => {
      if (confirmed && onDelete) {
        hapticNotification('success')
        onDelete(note.id)
        onBack()
      }
    })
  }

  const handleBack = () => {
    hapticImpact('light')
    onBack()
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
      {/* Header */}
      <header
        className="sticky top-0 z-50 safe-area-top"
        style={{
          backgroundColor: 'var(--bg-primary)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          {/* Back button */}
          <button
            onClick={handleBack}
            className="flex items-center gap-1 haptic-tap"
            style={{ color: 'var(--accent)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="text-base">Назад</span>
          </button>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {/* Share button */}
            <button
              onClick={handleShare}
              className="p-2 haptic-tap rounded-full"
              style={{ color: 'var(--accent)' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
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

        {/* Share button (bottom) */}
        <motion.button
          onClick={handleShare}
          className="w-full mt-6 py-3 px-4 rounded-xl font-semibold haptic-tap flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'white'
          }}
          whileTap={{ scale: 0.98 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Скопировать и поделиться
        </motion.button>
      </main>
    </motion.div>
  )
}

