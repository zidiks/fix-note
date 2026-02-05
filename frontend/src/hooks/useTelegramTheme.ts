import { useEffect } from 'react'
import { useTelegram } from './useTelegram'

type ViewState = 'list' | 'detail' | 'shared' | 'profile' | 'language' | 'subscription' | 'sync'

/**
 * Hook to manage Telegram native header and background colors based on current view
 * - List view: uses bg-primary color (lighter background)
 * - Detail view: uses bg-secondary color (darker/whiter background)
 * - Other views: uses bg-primary color
 */
export const useTelegramTheme = (viewState: ViewState) => {
  const { setHeaderColor, setBackgroundColor, colorScheme } = useTelegram()

  useEffect(() => {
    // Get computed CSS variable values
    const getComputedColor = (variable: string): string => {
      if (typeof window === 'undefined') return ''
      const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
      return value || ''
    }

    // Determine which color to use based on view state
    let colorVariable: string
    if (viewState === 'detail' || viewState === 'shared') {
      // Detail view uses secondary background (darker/whiter)
      colorVariable = '--bg-secondary'
    } else {
      // List and other views use primary background (lighter)
      colorVariable = '--bg-primary'
    }

    // Get the actual color value
    const color = getComputedColor(colorVariable)
    
    // Fallback colors if CSS variable is not available
    const fallbackColor = colorScheme === 'dark' 
      ? (viewState === 'detail' || viewState === 'shared' ? '#1C1C1E' : '#000000')
      : (viewState === 'detail' || viewState === 'shared' ? '#FCFCFC' : '#F0F0F2')

    const finalColor = color || fallbackColor

    // Set Telegram native colors
    setHeaderColor(finalColor)
    setBackgroundColor(finalColor)
  }, [viewState, colorScheme, setHeaderColor, setBackgroundColor])
}

