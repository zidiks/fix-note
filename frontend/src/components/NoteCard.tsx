import { format } from 'date-fns'
import { enUS, ru } from 'date-fns/locale'
import { Note } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'
import { useI18n } from '../i18n'

interface NoteCardProps {
  note: Note
  onSelect?: (note: Note) => void
  isFirst?: boolean
  isLast?: boolean
}

export const NoteCard = ({ note, onSelect, isFirst, isLast }: NoteCardProps) => {
  const { hapticImpact } = useTelegram()
  const { language } = useI18n()

  // Get title - AI-generated title, or first line of summary/content
  const title = note.title?.trim() ||
    (note.summary ? note.summary.split('\n')[0].slice(0, 50) : null) ||
    note.content.split('\n')[0].slice(0, 50) ||
    'Без названия'

  // Get subtitle - remaining content
  const subtitle = note.summary
    ? note.summary.trim().slice(0, 120)
    : note.content.trim().slice(0, 120)

  // Format date like Apple Notes
  const date = new Date(note.created_at)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()

  const locale = language === 'ru' ? ru : enUS
  let formattedDate: string
  if (isToday) {
    formattedDate = format(date, 'HH:mm')
  } else {
    formattedDate = format(date, 'd MMM', { locale })
  }

  const handleClick = () => {
    hapticImpact('light')
    onSelect?.(note)
  }

  const borderRadiusClasses = `
    ${isFirst ? 'rounded-t-xl' : ''}
    ${isLast ? 'rounded-b-xl' : ''}
  `.trim()

  return (
    <div
      className={`active:opacity-70 transition-opacity cursor-pointer bg-[var(--bg-secondary)] ${borderRadiusClasses}`}
      onClick={handleClick}
    >
      <div className="p-4">
        {/* Title with image indicator */}
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-base leading-tight truncate flex-1 first-letter:uppercase text-[var(--text-primary)]">
            {title}
          </h3>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {formattedDate}
          </span>
        </div>

        {/* Subtitle line */}
        <div className="flex items-center gap-2 mt-1.5">
          {subtitle ? (
            <span className="text-sm line-clamp-2 leading-4 flex-1 first-letter:uppercase text-[var(--text-secondary)]">
              {subtitle}
            </span>
          ) : (
            <span className="text-sm text-[var(--text-secondary)]">
              No additional text
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
