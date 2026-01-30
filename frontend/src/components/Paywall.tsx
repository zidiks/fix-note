import { motion, AnimatePresence } from 'framer-motion'
import { useI18n } from '../i18n'
import { useSubscription, PLAN_DETAILS } from '../stores/subscription'
import { useTelegram } from '../hooks/useTelegram'

interface PaywallProps {
  isOpen: boolean
  onClose: () => void
  feature: 'summary' | 'voice' | 'chat' | 'sync'
  requiredPlan?: 'pro' | 'ultra'
  onUpgrade: () => void
}

const featureInfo: Record<string, { icon: string; titleRu: string; titleEn: string; descRu: string; descEn: string }> = {
  summary: {
    icon: '✨',
    titleRu: 'AI-суммаризация',
    titleEn: 'AI Summary',
    descRu: 'Автоматическое создание краткого содержания ваших заметок с помощью ИИ',
    descEn: 'Automatically create summaries of your notes using AI',
  },
  voice: {
    icon: '🎙️',
    titleRu: 'Голосовые заметки',
    titleEn: 'Voice Notes',
    descRu: 'Записывайте голосовые сообщения, мы автоматически преобразуем их в текст',
    descEn: 'Record voice messages, we automatically convert them to text',
  },
  chat: {
    icon: '💬',
    titleRu: 'AI-чат',
    titleEn: 'AI Chat',
    descRu: 'Общайтесь с ИИ-ассистентом по вашим заметкам и базе знаний',
    descEn: 'Chat with AI assistant about your notes and knowledge base',
  },
  sync: {
    icon: '🔄',
    titleRu: 'Синхронизация',
    titleEn: 'Sync',
    descRu: 'Экспортируйте заметки в Notion, Obsidian и другие приложения',
    descEn: 'Export notes to Notion, Obsidian and other apps',
  },
}

export const Paywall = ({ isOpen, onClose, feature, requiredPlan = 'pro', onUpgrade }: PaywallProps) => {
  const { t, language } = useI18n()
  const { subscription, isTrialExpired, getTrialDaysLeft } = useSubscription()
  const { hapticImpact } = useTelegram()
  
  const currentPlan = subscription?.plan || 'trial'
  const trialExpired = isTrialExpired()
  const trialDays = getTrialDaysLeft()
  
  const info = featureInfo[feature]
  const planDetails = PLAN_DETAILS[requiredPlan]
  
  const handleUpgrade = () => {
    hapticImpact('medium')
    onClose()
    onUpgrade()
  }
  
  const handleClose = () => {
    hapticImpact('light')
    onClose()
  }
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200]"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
            onClick={handleClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-4 right-4 z-[201] max-w-md mx-auto rounded-3xl overflow-hidden"
            style={{ 
              backgroundColor: 'var(--bg-secondary)',
              bottom: 'calc(100px + env(safe-area-inset-bottom, 0px))',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            {/* Header Gradient */}
            <div 
              className="h-24 relative overflow-hidden"
              style={{ background: planDetails.gradient }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl">{info.icon}</span>
              </div>
              
              {/* Close button */}
              <button
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                onClick={handleClose}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            
            {/* Content */}
            <div className="p-5">
              <h2 
                className="text-xl font-bold text-center mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                {language === 'ru' ? info.titleRu : info.titleEn}
              </h2>
              
              <p 
                className="text-center text-sm mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                {language === 'ru' ? info.descRu : info.descEn}
              </p>
              
              {/* Trial/Plan Status */}
              {currentPlan === 'trial' && !trialExpired && (
                <div 
                  className="rounded-xl p-3 mb-4 text-center"
                  style={{ backgroundColor: 'rgba(255, 149, 0, 0.1)' }}
                >
                  <p 
                    className="text-sm"
                    style={{ color: 'var(--warning)' }}
                  >
                    ⏱️ {t('trialDaysLeft', { days: trialDays })}
                  </p>
                </div>
              )}
              
              {(currentPlan === 'free' || trialExpired) && (
                <div 
                  className="rounded-xl p-3 mb-4 text-center"
                  style={{ backgroundColor: 'rgba(255, 59, 48, 0.1)' }}
                >
                  <p 
                    className="text-sm"
                    style={{ color: 'var(--destructive)' }}
                  >
                    {trialExpired 
                      ? (language === 'ru' ? '⚠️ Пробный период истёк' : '⚠️ Trial expired')
                      : (language === 'ru' ? '🔒 Функция недоступна на Free плане' : '🔒 Feature not available on Free plan')
                    }
                  </p>
                </div>
              )}
              
              {/* Required Plan Badge */}
              <div className="flex items-center justify-center gap-2 mb-4">
                <span 
                  className="text-sm"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {t('featureRequires')}
                </span>
                <span 
                  className="px-2 py-1 rounded-full text-xs font-semibold text-white"
                  style={{ background: planDetails.gradient }}
                >
                  {planDetails.icon} {planDetails.name}
                </span>
              </div>
              
              {/* CTA Button */}
              <button
                className="w-full py-3.5 rounded-xl font-semibold text-white transition-all active:scale-[0.98]"
                style={{ background: planDetails.gradient }}
                onClick={handleUpgrade}
              >
                {t('upgrade')} → {planDetails.name}
              </button>
              
              {/* Skip for now */}
              <button
                className="w-full py-2 mt-2 text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                onClick={handleClose}
              >
                {language === 'ru' ? 'Не сейчас' : 'Not now'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

