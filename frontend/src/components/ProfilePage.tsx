import { motion } from 'framer-motion'
import { useI18n } from '../i18n'
import { useSubscription, PLAN_DETAILS } from '../stores/subscription'
import { useTelegram } from '../hooks/useTelegram'

interface ProfilePageProps {
  onBack?: () => void
  onLanguageClick: () => void
  onSubscriptionClick: () => void
}

export const ProfilePage = ({ onBack: _onBack, onLanguageClick, onSubscriptionClick }: ProfilePageProps) => {
  // onBack is handled by Telegram BackButton, kept for future use
  void _onBack
  const { t, language } = useI18n()
  const { user, hapticImpact } = useTelegram()
  const { subscription, getTrialDaysLeft } = useSubscription()
  
  const plan = subscription?.plan || 'trial'
  const planDetails = PLAN_DETAILS[plan]
  const trialDays = getTrialDaysLeft()
  
  // Get user initials
  const getInitials = () => {
    if (!user) return '?'
    const first = user.first_name?.[0] || ''
    const last = user.last_name?.[0] || ''
    return (first + last).toUpperCase() || '?'
  }
  
  const handleMenuClick = (action: () => void) => {
    hapticImpact('light')
    action()
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
          {t('myProfile')}
        </h1>
      </div>
      
      {/* Profile Card */}
      <div className="px-4 mb-6">
        <div 
          className="rounded-2xl p-5"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden"
              style={{ background: planDetails.gradient }}
            >
              {user?.photo_url ? (
                <img 
                  src={user.photo_url} 
                  alt="Avatar" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-white">
                  {getInitials()}
                </span>
              )}
            </div>
            
            {/* User Info */}
            <div className="flex-1">
              <h2 
                className="text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {user?.first_name} {user?.last_name || ''}
              </h2>
              {user?.username && (
                <p 
                  className="text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  @{user.username}
                </p>
              )}
              
              {/* Plan Badge */}
              <div className="mt-2 flex items-center gap-2">
                <span 
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                  style={{ background: planDetails.gradient }}
                >
                  <span>{planDetails.icon}</span>
                  <span>{planDetails.name}</span>
                </span>
                
                {plan === 'trial' && trialDays > 0 && (
                  <span 
                    className="text-xs"
                    style={{ color: 'var(--warning)' }}
                  >
                    {t('trialDaysLeft', { days: trialDays })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Menu Items */}
      <div className="px-4">
        <div 
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {/* Subscription */}
          <button
            className="w-full px-4 py-3.5 flex items-center justify-between active:opacity-70 transition-opacity"
            onClick={() => handleMenuClick(onSubscriptionClick)}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #AF52DE 0%, #FF2D55 100%)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
              </div>
              <span style={{ color: 'var(--text-primary)' }}>{t('subscription')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span 
                className="text-sm font-medium"
                style={{ color: planDetails.color }}
              >
                {planDetails.name}
              </span>
              <svg 
                width="8" 
                height="14" 
                viewBox="0 0 8 14" 
                fill="none"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <path d="M1 1L7 7L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </button>
          
          {/* Separator */}
          <div 
            className="ml-[52px]"
            style={{ height: '0.5px', backgroundColor: 'var(--separator)' }}
          />
          
          {/* Language */}
          <button
            className="w-full px-4 py-3.5 flex items-center justify-between active:opacity-70 transition-opacity"
            onClick={() => handleMenuClick(onLanguageClick)}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12H22"/>
                  <path d="M12 2C14.5 4.5 16 8 16 12C16 16 14.5 19.5 12 22C9.5 19.5 8 16 8 12C8 8 9.5 4.5 12 2Z"/>
                </svg>
              </div>
              <span style={{ color: 'var(--text-primary)' }}>{t('language')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span 
                className="text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {language === 'ru' ? '🇷🇺 Русский' : '🇬🇧 English'}
              </span>
              <svg 
                width="8" 
                height="14" 
                viewBox="0 0 8 14" 
                fill="none"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <path d="M1 1L7 7L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </button>
        </div>
      </div>
      
      {/* Info Section */}
      <div className="px-4 mt-6">
        <p 
          className="text-center text-sm"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t('allNotesSync')}
        </p>
        <p 
          className="text-center text-xs mt-2"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t('version')} 1.0.0
        </p>
      </div>
    </motion.div>
  )
}

