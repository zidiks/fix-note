import { motion } from 'framer-motion'
import { useEffect } from 'react'

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'info'
  onClose: () => void
}

export const Toast = ({ message, type, onClose }: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  const iconMap = {
    success: '✓',
    error: '✕',
    info: '↻'
  }

  const colorMap = {
    success: 'rgba(52, 199, 89, 0.9)',
    error: 'rgba(255, 59, 48, 0.9)',
    info: 'rgba(0, 122, 255, 0.9)'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -30, scale: 0.9 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed top-4 left-4 right-4 z-[200] safe-area-top"
    >
      <div
        className="mx-auto max-w-sm rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
        }}
      >
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: colorMap[type] }}
        >
          {iconMap[type]}
        </span>
        <span className="text-sm font-medium flex-1 text-[var(--text-primary)]">
          {message}
        </span>
      </div>
    </motion.div>
  )
}

