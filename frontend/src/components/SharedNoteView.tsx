import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { SharedNoteResponse } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'
import { ImageGallery } from './ui/ImageGallery'
import { Badge } from './ui/Badge'
import { Card } from './ui/Card'
import { LoadingSpinner } from './ui/LoadingSpinner'

interface SharedNoteViewProps {
  data?: SharedNoteResponse
  isLoading: boolean
}

export const SharedNoteView = ({ data, isLoading }: SharedNoteViewProps) => {
  const { hapticImpact, close } = useTelegram()

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">Загрузка заметки...</p>
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
          <h2 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
            Заметка не найдена
          </h2>
          <p className="mb-6 text-[var(--text-secondary)]">
            Возможно, ссылка устарела или у вас нет доступа к этой заметке
          </p>
          <button
            onClick={() => {
              hapticImpact('light')
              close()
            }}
            className="px-6 py-3 rounded-xl font-semibold bg-[var(--accent)] text-white"
          >
            Закрыть
          </button>
        </div>
      </div>
    )
  }

  const { note, is_owner } = data
  const isVoice = note.source === 'voice'
  const hasImages = note.images && note.images.length > 0
  const icon = hasImages ? '🖼️' : isVoice ? '🎤' : '📝'

  const displayTitle = note.title?.trim() ||
    (note.summary ? note.summary.split('\n')[0].trim() : null) ||
    note.content.split('\n')[0].trim() ||
    null

  const date = new Date(note.created_at)
  const formattedDate = format(date, "d MMMM yyyy 'в' HH:mm", { locale: ru })

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  return (
    <motion.div
      className="min-h-screen bg-[var(--bg-primary)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50 safe-area-top bg-[var(--bg-primary)] backdrop-blur-[20px]"
      >
        <div className="flex items-center justify-center px-4 py-3">
          {is_owner ? (
            <Badge className="bg-[rgba(52,199,89,0.15)] text-[#34C759]">
              Ваша заметка
            </Badge>
          ) : (
            <Badge className="bg-[rgba(0,122,255,0.15)] text-[var(--accent)]">
              Общая заметка
            </Badge>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="px-4 pb-8 safe-area-bottom">
        {/* Images gallery */}
        {hasImages && <ImageGallery images={note.images!} />}

        {/* Title */}
        {displayTitle && (
          <h1 className="text-xl font-semibold mb-4 leading-tight text-[var(--text-primary)]">
            {displayTitle}
          </h1>
        )}

        {/* Meta info */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{icon}</span>
          <div>
            <Badge variant={hasImages ? 'photo' : isVoice ? 'voice' : 'text'}>
              {hasImages ? 'С изображениями' : isVoice ? 'Голосовая заметка' : 'Текстовая заметка'}
            </Badge>
            {isVoice && note.duration_seconds && (
              <span className="text-sm ml-2 text-[var(--text-secondary)]">
                {formatDuration(note.duration_seconds)}
              </span>
            )}
            {hasImages && (
              <span className="text-sm ml-2 text-[var(--text-secondary)]">
                {note.images!.length} фото
              </span>
            )}
          </div>
        </div>

        {/* Date */}
        <p className="text-sm mb-6 text-[var(--text-secondary)]">
          {formattedDate}
        </p>

        {/* Summary */}
        {note.summary && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase mb-2 text-[var(--text-secondary)]">
              Краткое содержание
            </h3>
            <Card className="p-4">
              <p className="text-base leading-relaxed whitespace-pre-wrap selectable-text text-[var(--text-primary)]">
                {note.summary}
              </p>
            </Card>
          </div>
        )}

        {/* Full content */}
        <div>
          <h3 className="text-xs font-semibold uppercase mb-2 text-[var(--text-secondary)]">
            {note.summary ? 'Полный текст' : 'Содержание'}
          </h3>
          <Card className="p-4">
            <p className="text-base leading-relaxed whitespace-pre-wrap selectable-text text-[var(--text-primary)]">
              {note.content}
            </p>
          </Card>
        </div>
      </main>
    </motion.div>
  )
}

