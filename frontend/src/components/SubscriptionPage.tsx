import { useState } from 'react'
import { motion } from 'framer-motion'
import { useI18n } from '../i18n'
import { useSubscription, PLAN_DETAILS, PRICING, BillingPeriod } from '../stores/subscription'
import { useTelegram } from '../hooks/useTelegram'

interface SubscriptionPageProps {
  onBack?: () => void
}

interface PlanFeature {
  key: string
  free: string | boolean
  pro: string | boolean
  ultra: string | boolean
}

export const SubscriptionPage = ({ onBack: _onBack }: SubscriptionPageProps) => {
  // onBack is handled by Telegram BackButton, kept for future use
  void _onBack

  const { t, language } = useI18n()
  const { subscription, getTrialDaysLeft, isTrialExpired } = useSubscription()
  const { hapticImpact, hapticNotification, showPopup, tg } = useTelegram()

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')
  const [isProcessing, setIsProcessing] = useState(false)

  const currentPlan = subscription?.plan || 'trial'
  const trialDays = getTrialDaysLeft()
  const trialExpired = isTrialExpired()

  const features: PlanFeature[] = [
    {
      key: language === 'ru' ? 'AI-суммаризация' : 'AI Summary',
      free: '✖',
      pro: language === 'ru' ? 'до 200/мес' : 'up to 200/mo',
      ultra: language === 'ru' ? 'до 800/мес' : 'up to 800/mo',
    },
    {
      key: language === 'ru' ? 'Голосовые заметки' : 'Voice Notes',
      free: '✖',
      pro: language === 'ru' ? 'до 180 мин/мес' : 'up to 180 min/mo',
      ultra: language === 'ru' ? 'до 720 мин/мес' : 'up to 720 min/mo',
    },
    {
      key: 'AI-' + (language === 'ru' ? 'чат' : 'Chat'),
      free: '✖',
      pro: language === 'ru' ? 'Базовый' : 'Basic',
      ultra: language === 'ru' ? 'Быстрый + контекст' : 'Fast + context',
    },
    {
      key: 'Notion',
      free: '✖',
      pro: language === 'ru' ? 'Скоро' : 'Soon',
      ultra: language === 'ru' ? 'Авто-синк' : 'Auto-sync',
    },
    {
      key: 'Obsidian',
      free: '✖',
      pro: language === 'ru' ? 'Скоро' : 'Soon',
      ultra: language === 'ru' ? 'Авто-синк' : 'Auto-sync',
    },
    {
      key: 'Anytype',
      free: '✖',
      pro: language === 'ru' ? 'Скоро' : 'Soon',
      ultra: language === 'ru' ? 'Авто-синк' : 'Auto-sync',
    },
  ]

  const handleSubscribe = async (plan: 'pro' | 'ultra') => {
    if (currentPlan === plan) return

    hapticImpact('medium')
    setIsProcessing(true)

    try {
      const { api } = await import('../api/client')
      const invoice = await api.createInvoice(plan, billingPeriod)

      if (tg && invoice.invoice_link) {
        tg.openTelegramLink(invoice.invoice_link)
      }

      hapticNotification('success')
    } catch (error) {
      console.error('Payment error:', error)
      hapticNotification('error')
      showPopup({
        title: t('error'),
        message: (error as Error).message || t('tryAgain'),
        buttons: [{ type: 'ok' }],
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const getPrice = (plan: 'pro' | 'ultra') => {
    const prices = PRICING[plan]
    return billingPeriod === 'monthly' ? prices.monthly : prices.yearly
  }

  const getSavings = (plan: 'pro' | 'ultra') => {
    const prices = PRICING[plan]
    const yearlyCost = prices.yearly
    const monthlyForYear = prices.monthly * 12
    return Math.round(((monthlyForYear - yearlyCost) / monthlyForYear) * 100)
  }

  const renderPlanCard = (plan: 'pro' | 'ultra') => {
    const details = PLAN_DETAILS[plan]
    const isCurrent = currentPlan === plan
    const price = getPrice(plan)
    const savings = getSavings(plan)

    return (
      <motion.div
        key={plan}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: plan === 'pro' ? 0.1 : 0.2 }}
        className="relative rounded-2xl p-4 overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: isCurrent ? `2px solid ${details.color}` : '2px solid transparent',
        }}
      >
        {plan === 'ultra' && (
          <div
            className="absolute top-0 right-0 px-3 py-1 text-xs font-semibold text-white rounded-bl-xl"
            style={{ background: details.gradient }}
          >
            {language === 'ru' ? 'Популярный' : 'Popular'}
          </div>
        )}

        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ background: details.gradient }}
          >
            {details.icon}
          </div>
          <div>
            <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
              {details.name}
            </h3>
            {isCurrent && (
              <span className="text-xs" style={{ color: details.color }}>
                {t('currentPlan')}
              </span>
            )}
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {price}
            </span>
            <span className="text-lg">⭐</span>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              /{billingPeriod === 'monthly' ? (language === 'ru' ? 'мес' : 'mo') : (language === 'ru' ? 'год' : 'yr')}
            </span>
          </div>

          {billingPeriod === 'yearly' ? (
            <span className="text-xs" style={{ color: 'var(--success)' }}>
              {language === 'ru' ? `Экономия ${savings}%` : `Save ${savings}%`}
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--success)' }}>
              {language === 'ru' ? 'Автопродление каждые 30 дней' : 'Renews every 30 days'}
            </span>
          )}
        </div>

        <button
          className="w-full py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98]"
          style={{
            background: isCurrent ? 'var(--text-tertiary)' : details.gradient,
            opacity: isCurrent ? 0.5 : 1,
          }}
          disabled={isCurrent || isProcessing}
          onClick={() => handleSubscribe(plan)}
        >
          {isProcessing ? (
            <div className="spinner mx-auto" style={{ width: 20, height: 20, borderWidth: 2 }} />
          ) : isCurrent ? (
            t('currentPlan')
          ) : currentPlan === 'free' || currentPlan === 'trial' ? (
            t('subscribePlan')
          ) : (
            t('upgrade')
          )}
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="min-h-screen pb-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="px-4 pt-4 pb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('subscription')}
        </h1>
      </div>

      {(currentPlan === 'trial' || currentPlan === 'free') && (
        <div className="px-4 mb-4">
          <div
            className="rounded-2xl p-4"
            style={{
              background: trialExpired
                ? 'linear-gradient(135deg, rgba(255,59,48,0.15) 0%, rgba(255,149,0,0.15) 100%)'
                : 'linear-gradient(135deg, rgba(255,149,0,0.15) 0%, rgba(255,204,0,0.15) 100%)',
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">{trialExpired ? '⚠️' : '⏱️'}</span>
              <div>
                {trialExpired ? (
                  <>
                    <h3 className="font-semibold" style={{ color: 'var(--destructive)' }}>
                      {t('trialExpired')}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {t('trialExpiredDesc')}
                    </p>
                  </>
                ) : currentPlan === 'trial' ? (
                  <>
                    <h3 className="font-semibold" style={{ color: 'var(--warning)' }}>
                      {t('trial')}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {t('trialDaysLeft', { days: trialDays })}
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {t('free')}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {t('noAiFeatures')}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 mb-4">
        <div
          className="flex items-center justify-center gap-2 p-1 rounded-xl"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <button
            className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: billingPeriod === 'monthly' ? 'var(--accent)' : 'transparent',
              color: billingPeriod === 'monthly' ? 'white' : 'var(--text-secondary)',
            }}
            onClick={() => {
              hapticImpact('light')
              setBillingPeriod('monthly')
            }}
          >
            {t('monthly')}
          </button>
          <button
            className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all relative"
            style={{
              backgroundColor: billingPeriod === 'yearly' ? 'var(--accent)' : 'transparent',
              color: billingPeriod === 'yearly' ? 'white' : 'var(--text-secondary)',
            }}
            onClick={() => {
              hapticImpact('light')
              setBillingPeriod('yearly')
            }}
          >
            {t('yearly')}
            <span
              className="absolute -top-1 -right-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold"
              style={{ backgroundColor: 'var(--success)', color: 'white' }}
            >
              -17%
            </span>
          </button>
        </div>
      </div>

      <div className="px-4 space-y-3 mb-6 mt-2">
        {renderPlanCard('pro')}
        {renderPlanCard('ultra')}
      </div>

      <div className="px-4">
        <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          {t('features')}
        </h2>

        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div
            className="grid grid-cols-4 gap-2 px-3 py-2 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--separator)',
              color: 'var(--text-secondary)',
            }}
          >
            <div></div>
            <div className="text-center">Free</div>
            <div className="text-center" style={{ color: PLAN_DETAILS.pro.color }}>Pro</div>
            <div className="text-center" style={{ color: PLAN_DETAILS.ultra.color }}>Ultra</div>
          </div>

          {features.map((feature, index) => (
            <div key={feature.key}>
              <div className="grid grid-cols-4 gap-2 px-3 py-3 items-center">
                <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {feature.key}
                </div>
                <div className="text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {feature.free}
                </div>
                <div className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {feature.pro}
                </div>
                <div className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {feature.ultra}
                </div>
              </div>

              {index < features.length - 1 && (
                <div style={{ height: '0.5px', backgroundColor: 'var(--separator)' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 mt-6">
        <p className="text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {language === 'ru'
            ? 'Оплата через Telegram Stars ⭐. Месячный план продлевается автоматически, годовой оплачивается раз в год.'
            : 'Payment via Telegram Stars ⭐. Monthly plan auto-renews, yearly plan is billed once per year.'}
        </p>
      </div>
    </motion.div>
  )
}
