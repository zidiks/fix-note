import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Note } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'

interface NoteCardProps {
  note: Note
  onSelect?: (note: Note) => void
  isFirst?: boolean
  isLast?: boolean
}

export const NoteCard = ({ note, onSelect, isFirst, isLast }: NoteCardProps) => {
  const { hapticImpact } = useTelegram()

  // Get title - first line or summary
  const title = note.summary
    ? note.summary.split('\n')[0].slice(0, 50)
    : note.content.split('\n')[0].slice(0, 50)

  // Get subtitle - remaining content
  const subtitle = note.summary
    ? note.summary.split('\n').slice(1).join(' ').slice(0, 80)
    : note.content.split('\n').slice(1).join(' ').slice(0, 80)

  // Format date like Apple Notes
  const date = new Date(note.created_at)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  
  let formattedDate: string
  if (isToday) {
    formattedDate = format(date, 'HH:mm')
  } else {
    formattedDate = format(date, 'dd.MM.yyyy', { locale: ru })
  }

  const handleClick = () => {
    hapticImpact('light')
    onSelect?.(note)
  }

  return (
    <div
      className="active:opacity-70 transition-opacity cursor-pointer"
      onClick={handleClick}
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderTopLeftRadius: isFirst ? '12px' : 0,
        borderTopRightRadius: isFirst ? '12px' : 0,
        borderBottomLeftRadius: isLast ? '12px' : 0,
        borderBottomRightRadius: isLast ? '12px' : 0,
      }}
    >
      <div className="px-4 py-3">
        {/* Title */}
        <h3
          className="font-semibold text-base leading-tight truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {title || 'Без названия'}
        </h3>

        {/* Subtitle line */}
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className="text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {formattedDate}
          </span>
          {subtitle && (
            <span
              className="text-sm truncate flex-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              {subtitle}
            </span>
          )}
          {!subtitle && (
            <span
              className="text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              No additional text
            </span>
          )}
        </div>
      </div>

      {/* Separator */}
      {!isLast && (
        <div 
          className="h-px ml-4"
          style={{ backgroundColor: 'var(--separator)' }}
        />
      )}
    </div>
  )
}
