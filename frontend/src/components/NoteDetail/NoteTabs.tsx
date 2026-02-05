import { useRef, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useTelegram } from '../../hooks/useTelegram'
import { useI18n } from '../../i18n'

interface NoteTabsProps {
  activeTab: 'summary' | 'full'
  onTabChange: (tab: 'summary' | 'full') => void
  hasSummary: boolean
}

export const NoteTabs = ({ activeTab, onTabChange, hasSummary }: NoteTabsProps) => {
  const { hapticImpact } = useTelegram()
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const summaryTabRef = useRef<HTMLButtonElement>(null)
  const fullTabRef = useRef<HTMLButtonElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: '0px', width: '50%' })

  if (!hasSummary) return null

  // Calculate position and width for animated indicator
  const updateIndicatorPosition = () => {
    const activeTabRef = activeTab === 'summary' ? summaryTabRef : fullTabRef
    if (!activeTabRef.current || !containerRef.current) {
      return
    }

    const containerRect = containerRef.current.getBoundingClientRect()
    const tabRect = activeTabRef.current.getBoundingClientRect()
    const left = tabRect.left - containerRect.left
    const width = tabRect.width

    setIndicatorStyle({
      left: `${left}px`,
      width: `${width}px`,
    })
  }

  // Update indicator position when tab changes or on resize
  useEffect(() => {
    updateIndicatorPosition()
    
    const handleResize = () => {
      updateIndicatorPosition()
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeTab])

  // Initial position calculation
  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      updateIndicatorPosition()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const handleTabClick = (tab: 'summary' | 'full') => {
    hapticImpact('light')
    onTabChange(tab)
  }

  return (
    <div className="mb-6">
      <div 
        ref={containerRef}
        className="relative flex border-b border-[var(--separator)] px-5"
      >
        <button
          ref={summaryTabRef}
          type="button"
          onClick={() => handleTabClick('summary')}
          className="flex-1 pb-3 pt-1 text-center text-base font-medium transition-colors relative z-10"
          style={{
            color: activeTab === 'summary' ? 'var(--text-primary)' : 'var(--text-tertiary)',
          }}
        >
          {t('tabAiSummary')}
        </button>
        <button
          ref={fullTabRef}
          type="button"
          onClick={() => handleTabClick('full')}
          className="flex-1 pb-3 pt-1 text-center text-base font-medium transition-colors relative z-10"
          style={{
            color: activeTab === 'full' ? 'var(--text-primary)' : 'var(--text-tertiary)',
          }}
        >
          {t('tabFullText')}
        </button>
        
        {/* Animated accent indicator */}
        <motion.div
          className="absolute bottom-0 h-0.5 bg-[var(--accent)]"
          initial={false}
          animate={indicatorStyle}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
          style={{ marginBottom: -1 }}
        />
      </div>
    </div>
  )
}


