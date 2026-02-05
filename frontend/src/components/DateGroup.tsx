import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { Note } from '../api/client'
import { NoteCard } from './NoteCard'

interface DateGroupProps {
  label: string
  notes: Note[]
  groupIndex: number
  onSelectNote?: (note: Note) => void
}

export const DateGroup = forwardRef<HTMLElement, DateGroupProps>(
  ({ label, notes, groupIndex, onSelectNote }, ref) => {
    return (
      <motion.section
        ref={ref}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: groupIndex * 0.05 }}
        className="mb-6"
      >
        {/* Section header - Apple Notes style */}
        <h2 className="text-[15px] font-medium px-4 mb-2 ml-4 text-[var(--text-secondary)]">
          {label}
        </h2>

        {/* Notes container */}
        <div className="mx-4 overflow-hidden rounded-xl bg-[var(--bg-secondary)]">
          {notes.map((note, index) => (
            <NoteCard
              key={note.id}
              note={note}
              onSelect={onSelectNote}
              isFirst={index === 0}
              isLast={index === notes.length - 1}
            />
          ))}
        </div>
      </motion.section>
    )
  }
)

DateGroup.displayName = 'DateGroup'
