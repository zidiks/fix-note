import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Note } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'

interface NoteCardProps {
  note: Note
  index: number
  onSelect?: (note: Note) => void
  onDelete?: (id: string) => void
}

export const NoteCard = ({ note, index, onSelect, onDelete }: NoteCardProps) => {
  const { hapticImpact, hapticNotification, showConfirm } = useTelegram()

  const isVoice = note.source === 'voice'
  const icon = isVoice ? '🎤' : '📝'

  // Get preview text
  const title = note.summary
    ? note.summary.split('\n')[0].slice(0, 60)
    : note.content.split('\n')[0].slice(0, 60)

  const preview = note.summary
    ? note.summary.slice(title.length, title.length + 100)
    : note.content.slice(title.length, title.length + 100)

  // Format date
  const date = new Date(note.created_at)
  const isToday = new Date().toDateString() === date.toDateString()
  const formattedDate = isToday
    ? format(date, 'HH:mm')
    : format(date, 'd MMM, HH:mm', { locale: ru })

  const handleClick = () => {
    hapticImpact('light')
    onSelect?.(note)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
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
      className="note-card ios-card p-4 mx-4 mb-2 haptic-tap cursor-pointer"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      onClick={handleClick}
      style={{
        backgroundColor: 'var(--bg-secondary)'
      }}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="text-2xl flex-shrink-0 mt-0.5">
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3
            className="font-semibold text-base leading-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {title || 'Без названия'}
            {title.length >= 60 && '...'}
          </h3>

          {/* Preview */}
          {preview && (
            <p
              className="text-sm mt-1 line-clamp-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              {preview}
              {preview.length >= 100 && '...'}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 mt-2">
            {/* Source badge */}
            <span className={`badge ${isVoice ? 'badge-voice' : 'badge-text'}`}>
              {isVoice ? 'Голос' : 'Текст'}
            </span>

            {/* Duration for voice notes */}
            {isVoice && note.duration_seconds && (
              <span
                className="text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {Math.floor(note.duration_seconds / 60)}:{String(note.duration_seconds % 60).padStart(2, '0')}
              </span>
            )}

            {/* Date */}
            <span
              className="text-xs ml-auto"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {formattedDate}
            </span>

            {/* Chevron */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
