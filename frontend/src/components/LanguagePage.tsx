import { motion } from 'framer-motion'
import { useI18n, Language } from '../i18n'
import { useTelegram } from '../hooks/useTelegram'

interface LanguagePageProps {
  onBack?: () => void
}

const languages: { code: Language; name: string; short: string }[] = [
  { code: 'ru', name: '–усский', short: 'RU' },
  { code: 'en', name: 'English', short: 'EN' },
]

export const LanguagePage = ({ onBack: _onBack }: LanguagePageProps) => {
  void _onBack
  const { t, language, setLanguage } = useI18n()
  const { hapticImpact, hapticNotification } = useTelegram()

  const handleLanguageSelect = (lang: Language) => {
    if (lang === language) return
    hapticImpact('light')
    setLanguage(lang)
    setTimeout(() => hapticNotification('success'), 80)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.2 }}
      className="min-h-screen pb-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="px-4 pt-4 pb-4">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t('language')}</h1>
      </div>

      <div className="px-4">
        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--separator)' }}>
          {languages.map((lang, index) => {
            const active = language === lang.code
            return (
              <div key={lang.code}>
                <button
                  className="w-full h-14 px-4 flex items-center justify-between active:opacity-70"
                  onClick={() => handleLanguageSelect(lang.code)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                      {lang.short}
                    </div>
                    <span className="text-sm font-medium text-[var(--text-primary)]">{lang.name}</span>
                  </div>
                  {active && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </button>
                {index < languages.length - 1 && <div className="mx-4 h-px" style={{ backgroundColor: 'var(--separator)' }} />}
              </div>
            )
          })}
        </div>
      </div>

      <div className="px-4 mt-4 text-sm text-[var(--text-tertiary)]">
        {language === 'ru'
          ? 'язык интерфейса приложени€. —одержание заметок не мен€етс€.'
          : 'App interface language. Note content remains unchanged.'}
      </div>
    </motion.div>
  )
}
