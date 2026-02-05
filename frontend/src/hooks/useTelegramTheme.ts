import { useEffect } from 'react'
import { useTelegram } from './useTelegram'

type ViewState = 'list' | 'detail' | 'shared' | 'profile' | 'language' | 'subscription' | 'sync'

/**
 * Hook to manage Telegram native header and background colors based on current view
 * - List view: uses bg-primary color (lighter background)
 * - Detail view: uses bg-secondary color (darker/whiter background)
 * - Other views: uses bg-primary color
 */
// Convert RGB/RGBA color to hex format
const rgbToHex = (rgb: string): string => {
  // Match rgb(r, g, b) or rgba(r, g, b, a)
  const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/)
  if (!match) return rgb // Return as-is if not RGB format
  
  const r = parseInt(match[1], 10).toString(16).padStart(2, '0')
  const g = parseInt(match[2], 10).toString(16).padStart(2, '0')
  const b = parseInt(match[3], 10).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`.toUpperCase()
}

export const useTelegramTheme = (viewState: ViewState) => {
  const { setHeaderColor, setBackgroundColor, colorScheme } = useTelegram()

  useEffect(() => {
    // Small delay to ensure CSS variables are computed after theme class is applied
    const timeoutId = setTimeout(() => {
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

      // Get the actual color value from computed style
      let computedColor = getComputedColor(colorVariable)
      
      // Convert RGB to hex if needed
      if (computedColor && computedColor.startsWith('rgb')) {
        computedColor = rgbToHex(computedColor)
      }
      
      // Fallback colors if CSS variable is not available or empty
      const fallbackColor = colorScheme === 'dark' 
        ? (viewState === 'detail' || viewState === 'shared' ? '#1C1C1E' : '#000000')
        : (viewState === 'detail' || viewState === 'shared' ? '#FCFCFC' : '#F0F0F2')

      // Use computed color if available and valid, otherwise use fallback
      const finalColor = computedColor && computedColor !== 'none' && computedColor !== 'transparent' && computedColor !== ''
        ? computedColor
        : fallbackColor

      // Set Telegram native colors
      setHeaderColor(finalColor)
      setBackgroundColor(finalColor)
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [viewState, colorScheme, setHeaderColor, setBackgroundColor])
}


