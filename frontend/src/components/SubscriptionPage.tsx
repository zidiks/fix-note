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
  void _onBack

  const { t, language } = useI18n()
  const { subscription, fetchSubscription, getTrialDaysLeft, isTrialExpired } = useSubscription()
  const { hapticImpact, hapticNotification, showPopup, tg } = useTelegram()

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCanceling, setIsCanceling] = useState(false)

  const currentPlan = subscription?.plan || 'trial'
  const trialDays = getTrialDaysLeft()
  const trialExpired = isTrialExpired()

  const planRank: Record<'free' | 'trial' | 'pro' | 'ultra', number> = {
    free: 0,
    trial: 0,
    pro: 1,
    ultra: 2,
  }
  const currentRank = planRank[currentPlan]
  const isPaidPlan = currentPlan === 'pro' || currentPlan === 'ultra'
  const isCancelableMonthly =
    isPaidPlan &&
    subscription?.billing_period === 'monthly' &&
    !subscription?.is_canceled

  const subscriptionEndsAt = subscription?.subscription_expires_at
    ? new Date(subscription.subscription_expires_at).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US')
    : null

  const features: PlanFeature[] = [
    {
      key: language === 'ru' ? 'AI-суммаризация' : 'AI Summary',
      free: '—',
      pro: language === 'ru' ? 'до 200/мес' : 'up to 200/mo',
      ultra: language === 'ru' ? 'до 800/мес' : 'up to 800/mo',
    },
    {
      key: language === 'ru' ? 'Голосовые заметки' : 'Voice Notes',
      free: '—',
      pro: language === 'ru' ? 'до 180 мин/мес' : 'up to 180 min/mo',
      ultra: language === 'ru' ? 'до 720 мин/мес' : 'up to 720 min/mo',
    },
    {
      key: 'AI ' + (language === 'ru' ? 'чат' : 'Chat'),
      free: '—',
      pro: language === 'ru' ? 'Базовый' : 'Basic',
      ultra: language === 'ru' ? 'Быстрый' : 'Fast',
    },
    {
      key: t('syncNotes'),
      free: '—',
      pro: t('manualSync'),
      ultra: t('autoSync'),
    },
  ]

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

  const getActionLabel = (targetPlan: 'pro' | 'ultra') => {
    if (currentPlan === targetPlan) return t('currentPlan')
    if (currentPlan === 'free' || currentPlan === 'trial') return t('subscribePlan')
    const targetRank = planRank[targetPlan]
    if (targetRank < currentRank) return language === 'ru' ? 'Понизить' : 'Downgrade'
    return t('upgrade')
  }

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

  const handleCancelSubscription = async () => {
    hapticImpact('medium')
    setIsCanceling(true)
    try {
      const { api } = await import('../api/client')
      await api.cancelMonthlySubscription()
      await fetchSubscription()
      hapticNotification('success')
      showPopup({
        title: language === 'ru' ? 'Автопродление отключено' : 'Auto-renew disabled',
        message:
          language === 'ru'
            ? 'Подписка останется активной до конца оплаченного периода.'
            : 'Subscription remains active until the end of the paid period.',
        buttons: [{ type: 'ok' }],
      })
    } catch (error) {
      hapticNotification('error')
      showPopup({
        title: t('error'),
        message: (error as Error).message || t('tryAgain'),
        buttons: [{ type: 'ok' }],
      })
    } finally {
      setIsCanceling(false)
    }
  }

  const renderPlanCard = (plan: 'pro' | 'ultra') => {
    const isCurrent = currentPlan === plan
    const price = getPrice(plan)
    const savings = getSavings(plan)

    return (
      <div
        key={plan}
        className="rounded-2xl border p-4"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: isCurrent ? 'var(--text-primary)' : 'var(--separator)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{PLAN_DETAILS[plan].name}</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {billingPeriod === 'monthly'
                ? (language === 'ru' ? 'Ежемесячная оплата' : 'Monthly billing')
                : (language === 'ru' ? `Экономия ${savings}%` : `Save ${savings}%`)}
            </p>
          </div>
          {isCurrent && (
            <span className="text-xs px-2 py-1 rounded-full border" style={{ borderColor: 'var(--separator)', color: 'var(--text-secondary)' }}>
              {t('currentPlan')}
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-3xl font-semibold text-[var(--text-primary)]">{price}</span>
          <span className="text-base text-[var(--text-secondary)]">⭐ / {billingPeriod === 'monthly' ? (language === 'ru' ? 'мес' : 'mo') : (language === 'ru' ? 'год' : 'yr')}</span>
        </div>

        <button
          className="w-full h-11 rounded-xl text-sm font-medium border"
          style={{
            backgroundColor: isCurrent ? 'var(--bg-primary)' : 'var(--text-primary)',
            color: isCurrent ? 'var(--text-secondary)' : '#FFFFFF',
            borderColor: isCurrent ? 'var(--separator)' : 'var(--text-primary)',
          }}
          disabled={isCurrent || isProcessing || isCanceling}
          onClick={() => handleSubscribe(plan)}
        >
          {isProcessing ? (language === 'ru' ? 'Обработка...' : 'Processing...') : getActionLabel(plan)}
        </button>
      </div>
    )
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
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t('subscription')}</h1>
      </div>

      {(currentPlan === 'trial' || currentPlan === 'free') && (
        <div className="px-4 mb-4">
          <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--separator)' }}>
            <div className="text-sm font-medium text-[var(--text-primary)]">
              {trialExpired ? t('trialExpired') : currentPlan === 'trial' ? t('trialDaysLeft', { days: trialDays }) : t('free')}
            </div>
            <div className="text-sm mt-1 text-[var(--text-secondary)]">
              {trialExpired ? t('trialExpiredDesc') : currentPlan === 'free' ? t('noAiFeatures') : t('upgradeToAccess')}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 mb-4">
        <div className="rounded-xl border p-1 grid grid-cols-2" style={{ borderColor: 'var(--separator)', backgroundColor: 'var(--bg-secondary)' }}>
          <button
            className="h-9 rounded-lg text-sm"
            style={{ backgroundColor: billingPeriod === 'monthly' ? 'var(--bg-primary)' : 'transparent', color: 'var(--text-primary)' }}
            onClick={() => {
              hapticImpact('light')
              setBillingPeriod('monthly')
            }}
          >
            {t('monthly')}
          </button>
          <button
            className="h-9 rounded-lg text-sm"
            style={{ backgroundColor: billingPeriod === 'yearly' ? 'var(--bg-primary)' : 'transparent', color: 'var(--text-primary)' }}
            onClick={() => {
              hapticImpact('light')
              setBillingPeriod('yearly')
            }}
          >
            {t('yearly')}
          </button>
        </div>
      </div>

      <div className="px-4 space-y-3">
        {renderPlanCard('pro')}
        {renderPlanCard('ultra')}
      </div>

      {isPaidPlan && subscription?.billing_period === 'monthly' && (
        <div className="px-4 mt-4">
          <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--separator)' }}>
            <div className="text-sm font-medium text-[var(--text-primary)]">
              {language === 'ru' ? 'Автопродление' : 'Auto-renew'}
            </div>
            <div className="text-sm mt-1 text-[var(--text-secondary)]">
              {subscription?.is_canceled
                ? (language === 'ru'
                  ? `Отключено. Активно до ${subscriptionEndsAt || 'конца периода'}.`
                  : `Disabled. Active until ${subscriptionEndsAt || 'period end'}.`)
                : (language === 'ru' ? 'Платеж списывается каждые 30 дней.' : 'Billed every 30 days.')}
            </div>
            {!subscription?.is_canceled && isCancelableMonthly && (
              <button
                className="mt-3 h-10 px-4 rounded-xl border text-sm"
                style={{ borderColor: 'var(--separator)', color: 'var(--destructive)', backgroundColor: 'var(--bg-primary)' }}
                onClick={handleCancelSubscription}
                disabled={isCanceling}
              >
                {isCanceling ? (language === 'ru' ? 'Отключение...' : 'Disabling...') : (language === 'ru' ? 'Отключить автопродление' : 'Disable auto-renew')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="px-4 mt-6">
        <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">{t('features')}</h2>
        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--separator)' }}>
          <div className="grid grid-cols-4 text-xs font-medium px-3 py-2 border-b" style={{ borderColor: 'var(--separator)', color: 'var(--text-secondary)' }}>
            <div></div>
            <div className="text-center">Free</div>
            <div className="text-center">Pro</div>
            <div className="text-center">Ultra</div>
          </div>
          {features.map((feature, index) => (
            <div key={feature.key} className={`grid grid-cols-4 px-3 py-3 text-xs ${index < features.length - 1 ? 'border-b' : ''}`} style={{ borderColor: 'var(--separator)' }}>
              <div className="text-[var(--text-primary)] text-sm">{feature.key}</div>
              <div className="text-center text-[var(--text-secondary)]">{feature.free}</div>
              <div className="text-center text-[var(--text-secondary)]">{feature.pro}</div>
              <div className="text-center text-[var(--text-secondary)]">{feature.ultra}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 mt-6 text-xs text-center text-[var(--text-tertiary)]">
        {language === 'ru'
          ? 'Оплата через Telegram Stars ⭐.'
          : 'Payment via Telegram Stars ⭐.'}
      </div>
    </motion.div>
  )
}
