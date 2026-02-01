import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { SharedNoteResponse } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'

// Simple image gallery for shared view
const SharedImageGallery = ({ images }: { images: string[] }) => {
  const [selectedImage, setSelectedImage] = useState<number | null>(null)
  
  if (!images || images.length === 0) return null
  
  const gridCols = images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
  
  return (
    <>
      <div className={`grid ${gridCols} gap-2 mb-6`}>
        {images.map((img, index) => (
          <motion.div
            key={index}
            className="relative aspect-square rounded-xl overflow-hidden cursor-pointer"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedImage(index)}
          >
            <img
              src={img}
              alt={`Image ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </motion.div>
        ))}
      </div>
      
      <AnimatePresence>
        {selectedImage !== null && (
          <motion.div
            className="fixed inset-0 z-[300] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              className="absolute inset-0 bg-black/90"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            
            <motion.img
              src={images[selectedImage]}
              alt=""
              className="relative max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            />
            
            <motion.button
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white"
              onClick={() => setSelectedImage(null)}
              whileTap={{ scale: 0.9 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </motion.button>
            
            {images.length > 1 && (
              <motion.div
                className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium"
              >
                {selectedImage + 1} / {images.length}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

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

  const { note, is_owner } = data
  const isVoice = note.source === 'voice'
  const hasImages = note.images && note.images.length > 0
  const icon = hasImages ? '🖼️' : isVoice ? '🎤' : '📝'

  const date = new Date(note.created_at)
  const formattedDate = format(date, "d MMMM yyyy 'в' HH:mm", { locale: ru })

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
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
        <div className="flex items-center justify-center px-4 py-3">
          {is_owner ? (
            <span 
              className="text-xs font-medium px-2 py-1 rounded-full"
              style={{ 
                backgroundColor: 'rgba(52, 199, 89, 0.15)',
                color: '#34C759'
              }}
            >
              Ваша заметка
            </span>
          ) : (
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
      </header>

      {/* Content */}
      <main className="px-4 pb-8 safe-area-bottom">
        {/* Images gallery */}
        {hasImages && <SharedImageGallery images={note.images!} />}

        {/* Meta info */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{icon}</span>
          <div>
            <span className={`badge ${isVoice ? 'badge-voice' : hasImages ? 'badge-voice' : 'badge-text'}`}>
              {hasImages ? 'С изображениями' : isVoice ? 'Голосовая заметка' : 'Текстовая заметка'}
            </span>
            {isVoice && note.duration_seconds && (
              <span
                className="text-sm ml-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                {formatDuration(note.duration_seconds)}
              </span>
            )}
            {hasImages && (
              <span
                className="text-sm ml-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                {note.images!.length} фото
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
                className="text-base leading-relaxed whitespace-pre-wrap selectable-text"
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
              className="text-base leading-relaxed whitespace-pre-wrap selectable-text"
              style={{ color: 'var(--text-primary)' }}
            >
              {note.content}
            </p>
          </div>
        </div>
      </main>
    </motion.div>
  )
}

