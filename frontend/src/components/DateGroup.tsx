import { motion } from 'framer-motion'
import { Note } from '../api/client'
import { NoteCard } from './NoteCard'

interface DateGroupProps {
  label: string
  notes: Note[]
  groupIndex: number
  onDeleteNote?: (id: string) => void
  onSelectNote?: (note: Note) => void
}

export const DateGroup = ({ label, notes, groupIndex, onDeleteNote, onSelectNote }: DateGroupProps) => {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: groupIndex * 0.1 }}
      className="mb-4"
    >
      {/* Section header */}
      <h2 className="section-header uppercase">
        {label}
      </h2>

      {/* Notes */}
      <div className="space-y-2">
        {notes.map((note, index) => (
          <NoteCard
            key={note.id}
            note={note}
            index={index}
            onDelete={onDeleteNote}
            onSelect={onSelectNote}
          />
        ))}
      </div>
    </motion.section>
  )
}
