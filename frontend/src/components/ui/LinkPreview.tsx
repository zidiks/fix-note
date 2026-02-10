import { motion } from 'framer-motion'
import { useTelegram } from '../../hooks/useTelegram'

// URL regex pattern
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi

// Extract URLs from text
export const extractUrls = (text: string): string[] => {
  const matches = text.match(URL_REGEX)
  if (!matches) return []
  // Remove duplicates and clean trailing punctuation
  return [...new Set(matches.map(url => url.replace(/[.,;:!?)]+$/, '')))]
}

// Get domain from URL
const getDomain = (url: string): string => {
  try {
    const domain = new URL(url).hostname.replace('www.', '')
    return domain
  } catch {
    return url
  }
}

// Get favicon URL for a domain
const getFaviconUrl = (url: string): string => {
  const domain = getDomain(url)
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
}

interface LinkPreviewProps {
  url: string
  onClick?: () => void
}

export const LinkPreview = ({ url, onClick }: LinkPreviewProps) => {
  const { hapticImpact } = useTelegram()
  const domain = getDomain(url)
  const displayUrl = url.length > 50 ? url.substring(0, 50) + '...' : url

  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault()
        hapticImpact('light')
        onClick?.()
        window.open(url, '_blank', 'noopener,noreferrer')
      }}
      className="flex items-center gap-3 p-3 rounded-xl transition-all bg-[var(--bg-secondary)] border border-[var(--separator)]"
      whileTap={{ scale: 0.98 }}
    >
      <img
        src={getFaviconUrl(url)}
        alt=""
        className="w-6 h-6 rounded"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none'
        }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-[var(--accent)]">
          {domain}
        </p>
        <p className="text-xs truncate text-[var(--text-secondary)]">
          {displayUrl}
        </p>
      </div>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-[var(--text-tertiary)] flex-shrink-0"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </motion.a>
  )
}






