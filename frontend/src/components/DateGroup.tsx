import { motion } from 'framer-motion'
import { Note } from '../api/client'
import { NoteCard } from './NoteCard'

interface DateGroupProps {
  label: string
  notes: Note[]
  groupIndex: number
  onSelectNote?: (note: Note) => void
}

export const DateGroup = ({ label, notes, groupIndex, onSelectNote }: DateGroupProps) => {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: groupIndex * 0.05 }}
      className="mb-6"
    >
      {/* Section header - Apple Notes style */}
      <h2 
        className="text-xl font-bold px-4 mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        {label}
      </h2>

      {/* Notes container */}
      <div className="mx-4 overflow-hidden rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
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
