import { motion } from 'framer-motion'
import { useI18n } from '../i18n'
import { useSubscription, PLAN_DETAILS } from '../stores/subscription'
import { useTelegram } from '../hooks/useTelegram'

interface ProfilePageProps {
  onBack?: () => void
  onLanguageClick: () => void
  onSubscriptionClick: () => void
  onSyncClick: () => void
}

const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
)

const IconPlan = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2 7.5 14 3 9.6l6.2-.9L12 3z" />
  </svg>
)

const IconSync = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 3v6h-6" />
    <path d="M3 21v-6h6" />
    <path d="M20 9a8 8 0 0 0-14-3" />
    <path d="M4 15a8 8 0 0 0 14 3" />
  </svg>
)

const IconLang = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18" />
    <path d="M12 3a15 15 0 0 0 0 18" />
  </svg>
)

export const ProfilePage = ({ onBack: _onBack, onLanguageClick, onSubscriptionClick, onSyncClick }: ProfilePageProps) => {
  void _onBack
  const { t, language } = useI18n()
  const { user, hapticImpact } = useTelegram()
  const { subscription, getTrialDaysLeft } = useSubscription()

  const plan = subscription?.plan || 'trial'
  const planDetails = PLAN_DETAILS[plan]
  const trialDays = getTrialDaysLeft()

  const getInitials = () => {
    if (!user) return '?'
    const first = user.first_name?.[0] || ''
    const last = user.last_name?.[0] || ''
    return (first + last).toUpperCase() || '?'
  }

  const menu = [
    { key: 'subscription', label: t('subscription'), right: planDetails.name, icon: <IconPlan />, onClick: onSubscriptionClick },
    { key: 'sync', label: t('syncSettings'), right: null, icon: <IconSync />, onClick: onSyncClick },
    { key: 'language', label: t('language'), right: language === 'ru' ? 'RU' : 'EN', icon: <IconLang />, onClick: onLanguageClick },
  ]

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
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t('myProfile')}</h1>
      </div>

      <div className="px-4 mb-4">
        <div className="rounded-2xl border p-4 flex items-center gap-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--separator)' }}>
          <div className="w-14 h-14 rounded-full overflow-hidden border" style={{ borderColor: 'var(--separator)' }}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-semibold" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}>
                {getInitials()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-medium truncate text-[var(--text-primary)]">
              {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'FixNote'}
            </div>
            {user?.username && <div className="text-sm text-[var(--text-secondary)]">@{user.username}</div>}
            <div className="mt-1 text-sm text-[var(--text-secondary)]">
              {planDetails.name}
              {plan === 'trial' && trialDays > 0 ? ` · ${t('trialDaysLeft', { days: trialDays })}` : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4">
        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--separator)' }}>
          {menu.map((item, index) => (
            <div key={item.key}>
              <button
                className="w-full h-14 px-4 flex items-center gap-3 active:opacity-70"
                onClick={() => {
                  hapticImpact('light')
                  item.onClick()
                }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                  {item.icon}
                </div>
                <div className="text-sm font-medium text-[var(--text-primary)]">{item.label}</div>
                <div className="ml-auto flex items-center gap-2 text-[var(--text-secondary)]">
                  {item.right && <span className="text-sm">{item.right}</span>}
                  <ArrowRight />
                </div>
              </button>
              {index < menu.length - 1 && <div className="mx-4 h-px" style={{ backgroundColor: 'var(--separator)' }} />}
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 mt-6 text-xs text-center text-[var(--text-tertiary)]">
        <div>{t('allNotesSync')}</div>
        <div className="mt-1">{t('version')} 1.0.0</div>
      </div>
    </motion.div>
  )
}
