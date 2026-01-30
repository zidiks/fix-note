import { motion } from 'framer-motion'
import { useI18n, Language } from '../i18n'
import { useTelegram } from '../hooks/useTelegram'

interface LanguagePageProps {
  onBack: () => void
}

const languages: { code: Language; name: string; flag: string }[] = [
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
]

export const LanguagePage = ({ onBack }: LanguagePageProps) => {
  const { t, language, setLanguage } = useI18n()
  const { hapticImpact, hapticNotification } = useTelegram()
  
  const handleLanguageSelect = (lang: Language) => {
    if (lang === language) return
    
    hapticImpact('medium')
    setLanguage(lang)
    
    // Small delay for visual feedback
    setTimeout(() => {
      hapticNotification('success')
    }, 100)
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="min-h-screen"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-6">
        <h1 
          className="text-2xl font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('language')}
        </h1>
      </div>
      
      {/* Language Options */}
      <div className="px-4">
        <div 
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {languages.map((lang, index) => (
            <div key={lang.code}>
              <button
                className="w-full px-4 py-3.5 flex items-center justify-between active:opacity-70 transition-opacity"
                onClick={() => handleLanguageSelect(lang.code)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{lang.flag}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{lang.name}</span>
                </div>
                
                {language === lang.code && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                  >
                    <svg 
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24" 
                      fill="none"
                      style={{ color: 'var(--accent)' }}
                    >
                      <path 
                        d="M5 12L10 17L19 8" 
                        stroke="currentColor" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      />
                    </svg>
                  </motion.div>
                )}
              </button>
              
              {index < languages.length - 1 && (
                <div 
                  className="ml-[52px]"
                  style={{ height: '0.5px', backgroundColor: 'var(--separator)' }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Info */}
      <div className="px-4 mt-4">
        <p 
          className="text-sm"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {language === 'ru' 
            ? 'Язык интерфейса приложения. Заметки сохраняются на языке оригинала.'
            : 'App interface language. Notes are saved in their original language.'
          }
        </p>
      </div>
    </motion.div>
  )
}

