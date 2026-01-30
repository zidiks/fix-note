import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTelegram } from '../hooks/useTelegram'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onAddNote?: () => void
}

export const SearchBar = ({ value, onChange, placeholder = 'Поиск...', onAddNote }: SearchBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [isFocused, setIsFocused] = useState(false)
  const { hapticImpact } = useTelegram()

  // Show close button when input is focused
  const showCloseButton = isFocused

  // Handle iOS keyboard using visualViewport API
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const handleResize = () => {
      const windowHeight = window.innerHeight
      const viewportHeight = viewport.height
      const newKeyboardHeight = windowHeight - viewportHeight - viewport.offsetTop
      
      if (newKeyboardHeight > 100) {
        setKeyboardHeight(newKeyboardHeight)
        document.body.style.height = `${viewportHeight}px`
        document.body.style.overflow = 'hidden'
      } else {
        setKeyboardHeight(0)
        document.body.style.height = ''
        document.body.style.overflow = ''
      }
    }

    viewport.addEventListener('resize', handleResize)
    viewport.addEventListener('scroll', handleResize)

    return () => {
      viewport.removeEventListener('resize', handleResize)
      viewport.removeEventListener('scroll', handleResize)
      document.body.style.height = ''
      document.body.style.overflow = ''
    }
  }, [])

  const handleAddClick = () => {
    hapticImpact('medium')
    onAddNote?.()
  }

  const handleCloseClick = () => {
    hapticImpact('light')
    onChange('')
    inputRef.current?.blur()
    setIsFocused(false)
  }

  const handleFocus = () => setIsFocused(true)
  const handleBlur = (e: React.FocusEvent) => {
    // Don't blur if clicking on the close button
    const relatedTarget = e.relatedTarget as HTMLElement
    if (relatedTarget?.closest('.action-button--close')) {
      return
    }
    // Small delay for smooth transition
    setTimeout(() => setIsFocused(false), 50)
  }

  return (
    <>
      {/* Bottom fade gradient */}
      <div 
        className="bottom-fade"
        style={{
          bottom: keyboardHeight > 0 ? keyboardHeight : 0
        }}
      />

      {/* Bottom bar container */}
      <motion.div 
        className="bottom-bar"
        initial={{ opacity: 0, y: 20 }}
        animate={{ 
          opacity: 1, 
          y: 0,
          bottom: keyboardHeight > 0 ? keyboardHeight + 12 : undefined
        }}
        transition={{ 
          duration: 0.25,
          ease: [0.25, 0.46, 0.45, 0.94]
        }}
      >
        {/* Search bar */}
        <div className="liquid-glass">
          {/* Frosted glass background */}
          <div className="liquid-glass__frost" />
          
          {/* Gradient border overlay */}
          <div className="liquid-glass__gradient-border" />

          {/* Content */}
          <div className="liquid-glass__content">
            <div className="liquid-glass__icon">
              <svg 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
            </div>
            
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder={placeholder}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              enterKeyHint="search"
              className="liquid-glass__input"
            />
            
            <AnimatePresence>
              {value && !showCloseButton && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  onClick={() => {
                    onChange('')
                    inputRef.current?.focus()
                  }}
                  className="liquid-glass__clear"
                >
                  <svg 
                    width="10" 
                    height="10" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="3"
                    strokeLinecap="round"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right button - Add or Close */}
        <AnimatePresence mode="wait">
          {showCloseButton ? (
            // Close button when focused
            <motion.button 
              key="close"
              className="action-button action-button--close"
              onClick={handleCloseClick}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
            >
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </motion.button>
          ) : (
            // Add button when not focused
            <motion.button 
              key="add"
              className="action-button action-button--add"
              onClick={handleAddClick}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
            >
              <svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}


