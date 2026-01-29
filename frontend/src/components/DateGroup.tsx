import { motion } from 'framer-motion'
import { Note } from '../api/client.ts'
import { NoteCard } from './NoteCard.tsx'

interface DateGroupProps {
  label: string
  notes: Note[]
  groupIndex: number
  onDeleteNote?: (id: string) => void
}

export const DateGroup = ({ label, notes, groupIndex, onDeleteNote }: DateGroupProps) => {
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
          />
        ))}
      </div>
    </motion.section>
  )
}


