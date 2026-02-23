import { useState, useEffect, useCallback } from 'react';
import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  type SubscriptionAndroid,
  type SubscriptionIOS,
  type Purchase,
} from 'react-native-iap';
import { Platform } from 'react-native';
import { subscriptionApi } from '../api/subscription';
import { useSubscription } from '../stores/subscription';
import { IAP_PRODUCT_IDS } from '../stores/subscription';

type BillingPeriod = 'monthly' | 'yearly';
type Plan = 'pro' | 'ultra';

export function productIdForPlan(plan: Plan, period: BillingPeriod): string {
  return IAP_PRODUCT_IDS[plan][period];
}

const ALL_PRODUCT_IDS = [
  IAP_PRODUCT_IDS.pro.monthly,
  IAP_PRODUCT_IDS.pro.yearly,
  IAP_PRODUCT_IDS.ultra.monthly,
  IAP_PRODUCT_IDS.ultra.yearly,
];

export function useIAP() {
  const { fetchSubscription } = useSubscription();
  const [products, setProducts] = useState<(SubscriptionIOS | SubscriptionAndroid)[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let purchaseUpdateSub: ReturnType<typeof purchaseUpdatedListener>;
    let purchaseErrorSub: ReturnType<typeof purchaseErrorListener>;

    const connect = async () => {
      try {
        await initConnection();
        setIsConnected(true);

        // Load product metadata (prices from store)
        const subs = await getSubscriptions({ skus: ALL_PRODUCT_IDS });
        setProducts(subs as (SubscriptionIOS | SubscriptionAndroid)[]);

        // Listen for purchase events
        purchaseUpdateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
          await handlePurchase(purchase);
        });

        purchaseErrorSub = purchaseErrorListener((err) => {
          if ((err as { code?: string }).code !== 'E_USER_CANCELLED') {
            setError(err.message ?? 'Purchase error');
          }
          setIsLoading(false);
        });
      } catch (e) {
        // IAP not available (simulator, etc.)
      }
    };

    connect();

    return () => {
      purchaseUpdateSub?.remove();
      purchaseErrorSub?.remove();
      endConnection();
    };
  }, []);

  const handlePurchase = useCallback(async (purchase: Purchase) => {
    try {
      if (Platform.OS === 'ios') {
        const transactionReceipt = purchase.transactionReceipt;
        if (transactionReceipt) {
          await subscriptionApi.verifyAppleIAP({
            receipt_data: transactionReceipt,
            product_id: purchase.productId,
            transaction_id: purchase.transactionId ?? '',
          });
        }
      } else if (Platform.OS === 'android') {
        const purchaseToken = (purchase as { purchaseToken?: string }).purchaseToken;
        if (purchaseToken) {
          await subscriptionApi.verifyGooglePlay({
            purchase_token: purchaseToken,
            product_id: purchase.productId,
            order_id: purchase.transactionId ?? '',
          });
        }
      }

      await finishTransaction({ purchase, isConsumable: false });
      await fetchSubscription();
    } catch (e) {
      setError('Не удалось подтвердить покупку');
    } finally {
      setIsLoading(false);
    }
  }, [fetchSubscription]);

  const purchasePlan = useCallback(async (plan: Plan, period: BillingPeriod) => {
    const productId = productIdForPlan(plan, period);
    setIsLoading(true);
    setError(null);

    try {
      await requestSubscription({ sku: productId });
      // handlePurchase is called from purchaseUpdatedListener
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== 'E_USER_CANCELLED') {
        setError('Покупка не выполнена');
      }
      setIsLoading(false);
    }
  }, []);

  const getLocalizedPrice = useCallback((productId: string): string | null => {
    const product = products.find((p) => p.productId === productId);
    if (!product) return null;
    return (product as { localizedPrice?: string }).localizedPrice ?? null;
  }, [products]);

  return {
    isConnected,
    isLoading,
    error,
    purchasePlan,
    getLocalizedPrice,
    products,
  };
}
