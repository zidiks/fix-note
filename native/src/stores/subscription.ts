import { create } from 'zustand';
import { SubscriptionInfo, SubscriptionPlan } from '../api/types';
import { subscriptionApi } from '../api/subscription';

// Plan details for UI
export const PLAN_DETAILS: Record<SubscriptionPlan, {
  name: string;
  color: string;
  gradientColors: [string, string];
  icon: string;
}> = {
  free: {
    name: 'Free',
    color: '#8E8E93',
    gradientColors: ['#8E8E93', '#636366'],
    icon: '📝',
  },
  trial: {
    name: 'Trial',
    color: '#FF9500',
    gradientColors: ['#FF9500', '#FF6B00'],
    icon: '⏱️',
  },
  pro: {
    name: 'Pro',
    color: '#007AFF',
    gradientColors: ['#007AFF', '#5856D6'],
    icon: '⭐️',
  },
  ultra: {
    name: 'Ultra',
    color: '#AF52DE',
    gradientColors: ['#AF52DE', '#FF2D55'],
    icon: '💎',
  },
};

// IAP Product IDs (must match App Store Connect and Google Play Console)
export const IAP_PRODUCT_IDS = {
  pro: {
    monthly: 'fixnote.pro.monthly',
    yearly: 'fixnote.pro.yearly',
  },
  ultra: {
    monthly: 'fixnote.ultra.monthly',
    yearly: 'fixnote.ultra.yearly',
  },
} as const;

interface SubscriptionState {
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
  error: string | null;

  fetchSubscription: () => Promise<void>;
  canUseFeature: (feature: 'summary' | 'voice' | 'chat' | 'sync') => boolean;
  getTrialDaysLeft: () => number;
  isTrialExpired: () => boolean;
}

export const useSubscription = create<SubscriptionState>((set, get) => ({
  subscription: null,
  isLoading: false,
  error: null,

  fetchSubscription: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await subscriptionApi.getSubscription();
      set({ subscription: data, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  canUseFeature: (feature) => {
    const { subscription } = get();
    if (!subscription) return true;

    const { plan, limits, usage } = subscription;

    if (plan === 'trial' && get().isTrialExpired()) return false;
    if (plan === 'free') return false;

    switch (feature) {
      case 'summary':
        if (limits.summaries_per_month === null) return true;
        return usage.summaries_used < limits.summaries_per_month;
      case 'voice':
        if (limits.voice_minutes_per_month === null) return true;
        return usage.voice_seconds_used / 60 < limits.voice_minutes_per_month;
      case 'chat':
        return limits.ai_chat_enabled;
      case 'sync':
        return limits.sync_enabled;
      default:
        return false;
    }
  },

  getTrialDaysLeft: () => {
    const { subscription } = get();
    if (!subscription || subscription.plan !== 'trial') return 0;
    const trialEnds = new Date(subscription.trial_ends_at ?? Date.now());
    const diff = trialEnds.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  },

  isTrialExpired: () => {
    const { subscription } = get();
    if (!subscription || subscription.plan !== 'trial') return false;
    return new Date() > new Date(subscription.trial_ends_at ?? Date.now());
  },
}));
