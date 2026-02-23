import { useState, useEffect, useCallback } from 'react';
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

// Lazy accessor — avoids TurboModule crash in Expo Go
function getRNIap() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-iap');
  } catch {
    return null;
  }
}

export function useIAP() {
  const { fetchSubscription } = useSubscription();
  const [products, setProducts] = useState<unknown[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const iap = getRNIap();
    if (!iap) return; // Expo Go — IAP not available

    let purchaseUpdateSub: { remove: () => void } | undefined;
    let purchaseErrorSub: { remove: () => void } | undefined;

    const connect = async () => {
      try {
        await iap.initConnection();
        setIsConnected(true);

        const subs = await iap.getSubscriptions({ skus: ALL_PRODUCT_IDS });
        setProducts(subs);

        purchaseUpdateSub = iap.purchaseUpdatedListener(async (purchase: unknown) => {
          await handlePurchase(purchase as { transactionReceipt?: string; productId: string; transactionId?: string; purchaseToken?: string });
        });

        purchaseErrorSub = iap.purchaseErrorListener((err: { code?: string; message?: string }) => {
          if (err.code !== 'E_USER_CANCELLED') {
            setError(err.message ?? 'Purchase error');
          }
          setIsLoading(false);
        });
      } catch {
        // IAP not available (simulator / Expo Go)
      }
    };

    connect();

    return () => {
      purchaseUpdateSub?.remove();
      purchaseErrorSub?.remove();
      iap.endConnection?.();
    };
  }, []);

  const handlePurchase = useCallback(async (purchase: {
    transactionReceipt?: string;
    productId: string;
    transactionId?: string;
    purchaseToken?: string;
  }) => {
    const iap = getRNIap();
    try {
      if (Platform.OS === 'ios' && purchase.transactionReceipt) {
        await subscriptionApi.verifyAppleIAP({
          receipt_data: purchase.transactionReceipt,
          product_id: purchase.productId,
          transaction_id: purchase.transactionId ?? '',
        });
      } else if (Platform.OS === 'android' && purchase.purchaseToken) {
        await subscriptionApi.verifyGooglePlay({
          purchase_token: purchase.purchaseToken,
          product_id: purchase.productId,
          order_id: purchase.transactionId ?? '',
        });
      }

      if (iap) {
        await iap.finishTransaction({ purchase, isConsumable: false });
      }
      await fetchSubscription();
    } catch {
      setError('Не удалось подтвердить покупку');
    } finally {
      setIsLoading(false);
    }
  }, [fetchSubscription]);

  const purchasePlan = useCallback(async (plan: Plan, period: BillingPeriod) => {
    const iap = getRNIap();
    if (!iap) {
      setError('IAP недоступен в Expo Go. Используй dev build.');
      return;
    }
    const productId = productIdForPlan(plan, period);
    setIsLoading(true);
    setError(null);

    try {
      await iap.requestSubscription({ sku: productId });
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== 'E_USER_CANCELLED') {
        setError('Покупка не выполнена');
      }
      setIsLoading(false);
    }
  }, []);

  const getLocalizedPrice = useCallback((productId: string): string | null => {
    const product = (products as { productId: string; localizedPrice?: string }[])
      .find((p) => p.productId === productId);
    return product?.localizedPrice ?? null;
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
