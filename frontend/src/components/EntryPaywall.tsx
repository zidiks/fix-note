import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '../i18n'
import { useSubscription, PLAN_DETAILS, PRICING } from '../stores/subscription'
import { useTelegram } from '../hooks/useTelegram'

interface EntryPaywallProps {
  isOpen: boolean
  onClose: () => void
}

export const EntryPaywall = ({ isOpen, onClose }: EntryPaywallProps) => {
  const { language, t } = useI18n()
  const { getTrialDaysLeft, isTrialExpired } = useSubscription()
  const { hapticImpact, hapticNotification, showPopup, tg } = useTelegram()
  const [processingPlan, setProcessingPlan] = useState<'pro' | 'ultra' | null>(null)

  const trialExpired = isTrialExpired()
  const trialDays = getTrialDaysLeft()

  const handleClose = () => {
    hapticImpact('light')
    onClose()
  }

  const handleSubscribe = async (plan: 'pro' | 'ultra') => {
    if (processingPlan) return
    setProcessingPlan(plan)
    hapticImpact('medium')

    try {
      const { api } = await import('../api/client')
      const invoice = await api.createInvoice(plan, 'monthly')
      if (tg && invoice.invoice_link) {
        tg.openTelegramLink(invoice.invoice_link)
      }
      hapticNotification('success')
    } catch (error) {
      hapticNotification('error')
      showPopup({
        title: t('error'),
        message: (error as Error).message || t('tryAgain'),
        buttons: [{ type: 'ok' }],
      })
    } finally {
      setProcessingPlan(null)
    }
  }

  const renderPlan = (plan: 'pro' | 'ultra') => {
    const details = PLAN_DETAILS[plan]
    return (
      <button
        key={plan}
        className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.99]"
        style={{ backgroundColor: 'var(--bg-primary)' }}
        onClick={() => handleSubscribe(plan)}
        disabled={processingPlan !== null}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: details.gradient }}
            >
              {details.icon}
            </div>
            <div>
              <div className="font-semibold text-base text-[var(--text-primary)]">{details.name}</div>
              <div className="text-xs text-[var(--text-secondary)]">
                {language === 'ru' ? 'Подписка с автопродлением' : 'Auto-renewing subscription'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-[var(--text-primary)]">
              {PRICING[plan].monthly} ⭐
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              /{language === 'ru' ? 'мес' : 'mo'}
            </div>
          </div>
        </div>
      </button>
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[220]"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(4px)' }}
            onClick={handleClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            className="fixed left-4 right-4 z-[221] max-w-md mx-auto rounded-3xl overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              bottom: 'calc(100px + env(safe-area-inset-bottom, 0px))',
              boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
            }}
          >
            <div className="relative px-5 pt-5 pb-3">
              <button
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-opacity"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', opacity: 0.16 }}
                onClick={handleClose}
                aria-label={language === 'ru' ? 'Закрыть' : 'Close'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div className="text-center mb-3">
                <h2 className="text-xl font-bold text-[var(--text-primary)]">
                  {language === 'ru' ? 'FixNote Pro доступ' : 'FixNote Pro Access'}
                </h2>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  {language === 'ru'
                    ? 'Подключите подписку, чтобы использовать AI-функции и синхронизацию.'
                    : 'Get a subscription to unlock AI features and sync.'}
                </p>
              </div>

              <div
                className="rounded-xl p-3 mb-3 text-sm text-center"
                style={{ backgroundColor: trialExpired ? 'rgba(255,59,48,0.12)' : 'rgba(255,149,0,0.12)' }}
              >
                {trialExpired
                  ? (language === 'ru' ? t('trialExpired') : t('trialExpired'))
                  : t('trialDaysLeft', { days: trialDays })}
              </div>
            </div>

            <div className="px-4 pb-4 space-y-2">
              {renderPlan('pro')}
              {renderPlan('ultra')}
              <div className="text-center text-xs text-[var(--text-tertiary)] pt-1">
                {language === 'ru'
                  ? 'Оплата в Telegram Stars. Подписка продлевается каждые 30 дней.'
                  : 'Paid with Telegram Stars. Subscription renews every 30 days.'}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
