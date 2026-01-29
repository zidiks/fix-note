import { useEffect, useState } from 'react'
import { useTelegram } from './hooks/useTelegram.ts'
import { NotesList } from './components/NotesList.tsx'
import { SearchBar } from './components/SearchBar.tsx'

function App() {
  const { ready, expand, themeParams } = useTelegram()
  const [searchQuery, setSearchQuery] = useState('')
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Initialize Telegram WebApp
    ready()
    expand()

    // Apply theme
    if (themeParams) {
      const isDarkTheme = themeParams.bg_color === '#000000' ||
                          themeParams.bg_color === '#1c1c1e' ||
                          window.matchMedia('(prefers-color-scheme: dark)').matches
      setIsDark(isDarkTheme)

      if (isDarkTheme) {
        document.documentElement.classList.add('dark')
      }

      // Apply Telegram theme colors as CSS variables
      if (themeParams.bg_color) {
        document.documentElement.style.setProperty('--tg-theme-bg-color', themeParams.bg_color)
      }
      if (themeParams.text_color) {
        document.documentElement.style.setProperty('--tg-theme-text-color', themeParams.text_color)
      }
      if (themeParams.hint_color) {
        document.documentElement.style.setProperty('--tg-theme-hint-color', themeParams.hint_color)
      }
      if (themeParams.link_color) {
        document.documentElement.style.setProperty('--tg-theme-link-color', themeParams.link_color)
      }
      if (themeParams.button_color) {
        document.documentElement.style.setProperty('--tg-theme-button-color', themeParams.button_color)
      }
      if (themeParams.secondary_bg_color) {
        document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', themeParams.secondary_bg_color)
      }
    }
  }, [ready, expand, themeParams])

  return (
    <div className={`min-h-screen ${isDark ? 'dark' : ''}`} style={{
      backgroundColor: 'var(--tg-theme-bg-color, var(--bg-primary))',
      color: 'var(--tg-theme-text-color, var(--text-primary))'
    }}>
      {/* Header */}
      <header className="sticky top-0 z-50 safe-area-top" style={{
        backgroundColor: 'var(--tg-theme-bg-color, var(--bg-primary))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        <div className="px-4 py-3">
          <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
            Заметки
          </h1>
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Поиск заметок..."
          />
        </div>
      </header>

      {/* Content */}
      <main className="pb-8 safe-area-bottom">
        <NotesList searchQuery={searchQuery} />
      </main>
    </div>
  )
}

export default App


