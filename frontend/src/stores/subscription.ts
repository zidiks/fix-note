import { create } from 'zustand'

export type SubscriptionPlan = 'free' | 'trial' | 'pro' | 'ultra'
export type BillingPeriod = 'monthly' | 'yearly'

export interface SubscriptionLimits {
  summaries_per_month: number | null
  voice_minutes_per_month: number | null
  ai_chat_enabled: boolean
  ai_chat_fast: boolean
  sync_enabled: boolean
  auto_sync: boolean
  price_monthly_stars: number
  price_yearly_stars: number
}

export interface UsageStats {
  summaries_used: number
  voice_seconds_used: number
  chat_messages_used: number
}

export interface SubscriptionInfo {
  plan: SubscriptionPlan
  subscription_started_at: string | null
  subscription_expires_at: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  limits: SubscriptionLimits
  usage: UsageStats
}

// Plan details for UI
export const PLAN_DETAILS: Record<SubscriptionPlan, {
  name: string
  color: string
  gradient: string
  icon: string
}> = {
  free: {
    name: 'Free',
    color: '#8E8E93',
    gradient: 'linear-gradient(135deg, #8E8E93 0%, #636366 100%)',
    icon: '📝',
  },
  trial: {
    name: 'Trial',
    color: '#FF9500',
    gradient: 'linear-gradient(135deg, #FF9500 0%, #FF6B00 100%)',
    icon: '⏱️',
  },
  pro: {
    name: 'Pro',
    color: '#007AFF',
    gradient: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
    icon: '⭐️',
  },
  ultra: {
    name: 'Ultra',
    color: '#AF52DE',
    gradient: 'linear-gradient(135deg, #AF52DE 0%, #FF2D55 100%)',
    icon: '💎',
  },
}

// Pricing in Telegram Stars (XTR)
export const PRICING = {
  pro: {
    monthly: 350, // ~$7
    yearly: 3500, // ~$70
  },
  ultra: {
    monthly: 800, // ~$16
    yearly: 8000, // ~$160
  },
} as const

interface SubscriptionState {
  subscription: SubscriptionInfo | null
  isLoading: boolean
  error: string | null
  
  // Actions
  fetchSubscription: () => Promise<void>
  canUseFeature: (feature: 'summary' | 'voice' | 'chat' | 'sync') => boolean
  getTrialDaysLeft: () => number
  isTrialExpired: () => boolean
}

export const useSubscription = create<SubscriptionState>((set, get) => ({
  subscription: null,
  isLoading: false,
  error: null,
  
  fetchSubscription: async () => {
    set({ isLoading: true, error: null })
    try {
      const { api } = await import('../api/client')
      const data = await api.getSubscription()
      set({ subscription: data, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },
  
  canUseFeature: (feature) => {
    const { subscription } = get()
    if (!subscription) return false
    
    const { plan, limits, usage } = subscription
    
    // Check trial expiration
    if (plan === 'trial' && get().isTrialExpired()) {
      return false
    }
    
    switch (feature) {
      case 'summary':
        if (plan === 'free') return false
        if (limits.summaries_per_month === null) return true // Unlimited
        return usage.summaries_used < limits.summaries_per_month
        
      case 'voice':
        if (plan === 'free') return false
        if (limits.voice_minutes_per_month === null) return true
        return (usage.voice_seconds_used / 60) < limits.voice_minutes_per_month
        
      case 'chat':
        if (plan === 'free') return false
        return limits.ai_chat_enabled
        
      case 'sync':
        if (plan === 'free') return false
        return limits.sync_enabled
        
      default:
        return false
    }
  },
  
  getTrialDaysLeft: () => {
    const { subscription } = get()
    if (!subscription || subscription.plan !== 'trial') return 0
    
    const trialEnds = new Date(subscription.trial_ends_at || Date.now())
    const now = new Date()
    const diff = trialEnds.getTime() - now.getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  },
  
  isTrialExpired: () => {
    const { subscription } = get()
    if (!subscription || subscription.plan !== 'trial') return false
    
    const trialEnds = new Date(subscription.trial_ends_at || Date.now())
    return new Date() > trialEnds
  },
}))

