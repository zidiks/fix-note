import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { SharedNoteResponse } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'

interface SharedNoteViewProps {
  data?: SharedNoteResponse
  isLoading: boolean
  shareToken: string | null
}

export const SharedNoteView = ({ data, isLoading, shareToken }: SharedNoteViewProps) => {
  const { hapticImpact, hapticNotification, shareText, close } = useTelegram()

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-current border-t-transparent rounded-full mx-auto mb-4" 
               style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Загрузка заметки...</p>
        </div>
      </div>
    )
  }

  // Not found or access denied
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Заметка не найдена
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Возможно, ссылка устарела или у вас нет доступа к этой заметке
          </p>
          <button
            onClick={() => {
              hapticImpact('light')
              close()
            }}
            className="px-6 py-3 rounded-xl font-semibold"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'white'
            }}
          >
            Закрыть
          </button>
        </div>
      </div>
    )
  }

  const { note, is_owner, can_edit } = data
  const isVoice = note.source === 'voice'
  const icon = isVoice ? '🎤' : '📝'

  const date = new Date(note.created_at)
  const formattedDate = format(date, "d MMMM yyyy 'в' HH:mm", { locale: ru })

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const handleShare = () => {
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
    hapticNotification('success')
  }

  return (
    <motion.div
      className="min-h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
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
          <div className="flex items-center gap-2">
            {is_owner && (
              <span 
                className="text-xs font-medium px-2 py-1 rounded-full"
                style={{ 
                  backgroundColor: 'rgba(52, 199, 89, 0.15)',
                  color: '#34C759'
                }}
              >
                Ваша заметка
              </span>
            )}
            {!is_owner && (
              <span 
                className="text-xs font-medium px-2 py-1 rounded-full"
                style={{ 
                  backgroundColor: 'rgba(0, 122, 255, 0.15)',
                  color: 'var(--accent)'
                }}
              >
                Общая заметка
              </span>
            )}
          </div>

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

        {/* Actions */}
        {can_edit && (
          <p 
            className="text-sm text-center mt-6"
            style={{ color: 'var(--text-secondary)' }}
          >
            Вы можете редактировать эту заметку в боте
          </p>
        )}
      </main>
    </motion.div>
  )
}

