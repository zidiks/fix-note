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
  const { subscription, fetchSubscription, getTrialDaysLeft, isTrialExpired } = useSubscription()
  const { hapticImpact, hapticNotification, showPopup, tg } = useTelegram()

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')
  const [isProcessing, setIsProcessing] = useState(false)
  const [cancelStep, setCancelStep] = useState<0 | 1 | 2 | 3 | 4>(0)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelKeyword, setCancelKeyword] = useState('')
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
  const activePaidPlan = currentPlan === 'pro' || currentPlan === 'ultra' ? currentPlan : null
  const isPaidPlan = activePaidPlan !== null
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
      key: t('syncNotes'),
      free: '✖',
      pro: t('manualSync'),
      ultra: t('autoSync'),
    },
  ]

  const handleSubscribe = async (
    plan: 'pro' | 'ultra',
    force = false,
    periodOverride?: BillingPeriod
  ) => {
    if (!force && currentPlan === plan) return

    hapticImpact('medium')
    setIsProcessing(true)

    try {
      const { api } = await import('../api/client')
      const invoice = await api.createInvoice(plan, periodOverride ?? billingPeriod)

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

  const resetCancelFlow = () => {
    setCancelStep(0)
    setCancelReason('')
    setCancelKeyword('')
  }

  const handleCancelSubscription = async () => {
    hapticImpact('heavy')
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
            : 'Subscription will remain active until the end of the paid period.',
        buttons: [{ type: 'ok' }],
      })
      resetCancelFlow()
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
    if (currentPlan === targetPlan) {
      return t('currentPlan')
    }
    if (currentPlan === 'free' || currentPlan === 'trial') {
      return t('subscribePlan')
    }
    const targetRank = planRank[targetPlan]
    if (targetRank < currentRank) {
      return language === 'ru' ? 'Понизить' : 'Downgrade'
    }
    return t('upgrade')
  }

  const cancelConfirmWord = language === 'ru' ? 'ОТМЕНА' : 'CANCEL'
  const isCancelKeywordValid = cancelKeyword.trim().toUpperCase() === cancelConfirmWord
  const cancelReasons = language === 'ru'
    ? [
        'Редко пользуюсь',
        'Дорого',
        'Не нашел нужных функций',
        'Пока просто пауза',
      ]
    : [
        'I use it rarely',
        'Too expensive',
        'Missing features',
        'Just pausing for now',
      ]

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
          disabled={isCurrent || isProcessing || isCanceling}
          onClick={() => handleSubscribe(plan)}
        >
          {isProcessing ? (
            <div className="spinner mx-auto" style={{ width: 20, height: 20, borderWidth: 2 }} />
          ) : isCurrent ? (
            t('currentPlan')
          ) : (
            getActionLabel(plan)
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

      {isPaidPlan && subscription?.billing_period === 'monthly' && (
        <div className="px-4 mb-6">
          <div
            className="rounded-2xl p-4 border"
            style={{
              background: 'linear-gradient(135deg, rgba(255,59,48,0.08) 0%, rgba(10,10,12,0.95) 100%)',
              borderColor: 'rgba(255,59,48,0.35)',
            }}
          >
            <div className="mb-3">
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {language === 'ru' ? 'Управление автопродлением' : 'Auto-renew management'}
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {subscription?.is_canceled
                  ? (language === 'ru'
                    ? `Автопродление отключено. Доступ сохранится до ${subscriptionEndsAt || 'конца периода'}.`
                    : `Auto-renew is disabled. Access stays active until ${subscriptionEndsAt || 'period end'}.`)
                  : (language === 'ru'
                    ? 'Подписка продлевается каждые 30 дней. Отмена доступна, но скрыта глубже в настройках.'
                    : 'This plan renews every 30 days. Cancellation is available but intentionally buried.' )}
              </p>
            </div>

            {!subscription?.is_canceled && isCancelableMonthly && (
              <button
                className="w-full py-3 rounded-xl font-semibold transition-all active:scale-[0.98]"
                style={{
                  background: 'rgba(255,59,48,0.14)',
                  color: '#FF7A72',
                  border: '1px solid rgba(255,59,48,0.35)',
                }}
                onClick={() => {
                  hapticImpact('light')
                  setCancelStep(1)
                }}
                disabled={isCanceling}
              >
                {language === 'ru' ? 'Отключить автопродление' : 'Disable auto-renew'}
              </button>
            )}
          </div>
        </div>
      )}

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

      {cancelStep > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end p-3">
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className="w-full rounded-2xl p-4 border relative"
            style={{
              background: 'linear-gradient(180deg, rgba(22,22,24,0.98) 0%, rgba(6,6,8,1) 100%)',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <button
              className="absolute top-2 right-2 text-[10px] px-1 py-0.5 rounded opacity-20 hover:opacity-40"
              style={{ color: 'var(--text-tertiary)' }}
              onClick={resetCancelFlow}
            >
              ×
            </button>

            <div className="mb-3 pr-6">
              <div className="text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>
                {language === 'ru' ? `Шаг ${cancelStep} из 4` : `Step ${cancelStep} of 4`}
              </div>
              <div className="w-full h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(cancelStep / 4) * 100}%`,
                    background: 'linear-gradient(90deg, #FF9500 0%, #FF3B30 100%)',
                  }}
                />
              </div>
            </div>

            {cancelStep === 1 && (
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {language === 'ru' ? 'Не уходите так быстро' : 'Wait before you leave'}
                </h3>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {language === 'ru'
                    ? 'После отмены вы потеряете автопродление и рискуете остаться без AI-функций в самый нужный момент.'
                    : 'After cancellation you lose auto-renew and may unexpectedly lose AI features.'}
                </p>
                <button
                  className="w-full py-3 rounded-xl font-semibold text-white mb-2"
                  style={{ background: PLAN_DETAILS.ultra.gradient }}
                  onClick={resetCancelFlow}
                >
                  {language === 'ru' ? 'Оставить как есть' : 'Keep subscription'}
                </button>
                <button
                  className="w-full py-3 rounded-xl font-medium"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
                  onClick={() => setCancelStep(2)}
                >
                  {language === 'ru' ? 'Все равно продолжить' : 'Continue anyway'}
                </button>
              </div>
            )}

            {cancelStep === 2 && activePaidPlan && (
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {language === 'ru' ? 'Сначала лучше так:' : 'Better option first:'}
                </h3>
                <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                  {language === 'ru'
                    ? 'Переключитесь на годовой план и платите реже. Так вы сохраните функции и снизите риск пропуска продления.'
                    : 'Switch to yearly billing to pay less often and keep all features uninterrupted.'}
                </p>
                <div className="text-xs mb-4" style={{ color: 'var(--success)' }}>
                  {language === 'ru'
                    ? `${PRICING[activePaidPlan].yearly} ⭐ в год вместо ${PRICING[activePaidPlan].monthly * 12} ⭐`
                    : `${PRICING[activePaidPlan].yearly} ⭐ yearly instead of ${PRICING[activePaidPlan].monthly * 12} ⭐`}
                </div>
                <button
                  className="w-full py-3 rounded-xl font-semibold text-white mb-2"
                  style={{ background: PLAN_DETAILS.pro.gradient }}
                  onClick={async () => {
                    setBillingPeriod('yearly')
                    await handleSubscribe(activePaidPlan, true, 'yearly')
                    resetCancelFlow()
                  }}
                >
                  {language === 'ru' ? 'Перейти на годовой план' : 'Switch to yearly'}
                </button>
                <button
                  className="w-full py-3 rounded-xl font-medium"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
                  onClick={() => setCancelStep(3)}
                >
                  {language === 'ru' ? 'Нет, хочу отменить' : 'No, continue cancel'}
                </button>
              </div>
            )}

            {cancelStep === 3 && (
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {language === 'ru' ? 'Почему хотите отключить?' : 'Why are you leaving?'}
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  {language === 'ru'
                    ? 'Выберите причину. Это обязательный шаг перед отменой.'
                    : 'Pick one reason. This step is required before cancellation.'}
                </p>
                <div className="space-y-2 mb-4">
                  {cancelReasons.map((reason) => (
                    <button
                      key={reason}
                      className="w-full text-left px-3 py-2 rounded-xl border text-sm"
                      style={{
                        borderColor: cancelReason === reason ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                        background: cancelReason === reason ? 'rgba(0,122,255,0.16)' : 'rgba(255,255,255,0.03)',
                        color: 'var(--text-primary)',
                      }}
                      onClick={() => setCancelReason(reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <button
                  className="w-full py-3 rounded-xl font-semibold text-white mb-2 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #FF9500 0%, #FF3B30 100%)' }}
                  disabled={!cancelReason}
                  onClick={() => setCancelStep(4)}
                >
                  {language === 'ru' ? 'Продолжить отмену' : 'Continue cancellation'}
                </button>
                <button
                  className="w-full py-3 rounded-xl font-medium"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
                  onClick={() => setCancelStep(2)}
                >
                  {language === 'ru' ? 'Назад' : 'Back'}
                </button>
              </div>
            )}

            {cancelStep === 4 && (
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {language === 'ru' ? 'Финальное подтверждение' : 'Final confirmation'}
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  {language === 'ru'
                    ? `Введите слово "${cancelConfirmWord}", чтобы отключить автопродление.`
                    : `Type "${cancelConfirmWord}" to disable auto-renew.`}
                </p>
                <input
                  className="w-full px-3 py-3 rounded-xl border mb-4 text-sm outline-none"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    borderColor: 'rgba(255,255,255,0.12)',
                    color: 'var(--text-primary)',
                  }}
                  value={cancelKeyword}
                  onChange={(e) => setCancelKeyword(e.target.value)}
                  placeholder={cancelConfirmWord}
                />
                <button
                  className="w-full py-3 rounded-xl font-semibold text-white mb-2 disabled:opacity-40"
                  style={{ background: '#FF3B30' }}
                  disabled={!isCancelKeywordValid || isCanceling}
                  onClick={handleCancelSubscription}
                >
                  {isCanceling
                    ? (language === 'ru' ? 'Отменяем...' : 'Canceling...')
                    : (language === 'ru' ? 'Да, отключить автопродление' : 'Yes, disable auto-renew')}
                </button>
                <button
                  className="w-full py-3 rounded-xl font-medium"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
                  onClick={() => setCancelStep(3)}
                  disabled={isCanceling}
                >
                  {language === 'ru' ? 'Назад' : 'Back'}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
