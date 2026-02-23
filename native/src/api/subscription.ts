import { apiClient } from './client';
import { SubscriptionInfo, IAPVerifyResponse, BillingPeriod, SubscriptionPlan } from './types';

export const subscriptionApi = {
  async getSubscription(): Promise<SubscriptionInfo> {
    const { data } = await apiClient.get<SubscriptionInfo>('/subscription');
    return data;
  },

  async verifyAppleIAP(payload: {
    receipt_data: string;
    product_id: string;
    transaction_id: string;
  }): Promise<IAPVerifyResponse> {
    const { data } = await apiClient.post<IAPVerifyResponse>('/subscription/apple-iap', payload);
    return data;
  },

  async verifyGooglePlay(payload: {
    purchase_token: string;
    product_id: string;
    order_id: string;
  }): Promise<IAPVerifyResponse> {
    const { data } = await apiClient.post<IAPVerifyResponse>('/subscription/google-play', payload);
    return data;
  },

  // Legacy Telegram Stars invoice (still works for users coming from Telegram Mini App)
  async createInvoice(
    plan: SubscriptionPlan,
    billingPeriod: BillingPeriod
  ): Promise<{ invoice_link: string }> {
    const { data } = await apiClient.post<{ invoice_link: string }>('/subscription/invoice', {
      plan,
      billing_period: billingPeriod,
    });
    return data;
  },
};
