import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../../navigation/types';
import { useTheme } from '../../theme/useTheme';
import { useI18n } from '../../i18n';
import { useSubscription, PLAN_DETAILS, IAP_PRODUCT_IDS } from '../../stores/subscription';
import { useIAP, productIdForPlan } from '../../hooks/useIAP';

type Props = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, 'Subscription'>;
};

type BillingPeriod = 'monthly' | 'yearly';

export default function SubscriptionScreen({ navigation }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();
  const { subscription, fetchSubscription } = useSubscription();
  const { purchasePlan, getLocalizedPrice, isLoading: iapLoading, error: iapError } = useIAP();

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  useEffect(() => {
    fetchSubscription();
  }, []);

  useEffect(() => {
    if (iapError) {
      Alert.alert(t('error'), iapError);
    }
  }, [iapError, t]);

  const handlePurchase = async (plan: 'pro' | 'ultra') => {
    await purchasePlan(plan, billingPeriod);
  };

  const handleManageSubscription = () => {
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions';
    Linking.openURL(url);
  };

  const plan = subscription?.plan ?? 'free';
  const currentPlanDetails = PLAN_DETAILS[plan];

  const PlanCard = ({ planKey }: { planKey: 'pro' | 'ultra' }) => {
    const details = PLAN_DETAILS[planKey];
    const productId = productIdForPlan(planKey, billingPeriod);
    const localizedPrice = getLocalizedPrice(productId);
    const isCurrent = plan === planKey;

    const features =
      planKey === 'pro'
        ? ['200 суммарайзов/мес', '180 мин голоса/мес', 'AI чат (базовый)', 'Ручная синхронизация']
        : ['800 суммарайзов/мес', '720 мин голоса/мес', 'AI чат (быстрый + контекст)', 'Авто-синхронизация'];

    return (
      <View
        style={[
          styles.planCard,
          {
            backgroundColor: colors.bgSecondary,
            borderColor: isCurrent ? details.color : colors.separator,
            borderWidth: isCurrent ? 2 : 0.5,
          },
        ]}
      >
        <View style={styles.planHeader}>
          <Text style={{ fontSize: 28 }}>{details.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[typography.title3, { color: colors.textPrimary }]}>{details.name}</Text>
            {isCurrent && (
              <Text style={[typography.caption1, { color: details.color }]}>Текущий план</Text>
            )}
          </View>
          {localizedPrice ? (
            <Text style={[typography.headline, { color: details.color }]}>{localizedPrice}</Text>
          ) : null}
        </View>

        <View style={styles.features}>
          {features.map((feature, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={{ color: details.color }}>✓</Text>
              <Text style={[typography.subheadline, { color: colors.textSecondary }]}>{feature}</Text>
            </View>
          ))}
        </View>

        {!isCurrent && (
          <TouchableOpacity
            style={[styles.subscribeButton, { backgroundColor: details.color }]}
            onPress={() => handlePurchase(planKey)}
            disabled={iapLoading}
          >
            {iapLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.subscribeButtonText}>
                {t('subscribePlan')} {details.name}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backText, { color: colors.accent }]}>← {t('back')}</Text>
        </TouchableOpacity>
        <Text style={[typography.headline, { color: colors.textPrimary }]}>{t('subscription')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {/* Current Plan */}
        <View style={[styles.currentPlanCard, { backgroundColor: currentPlanDetails.color + '15', borderColor: currentPlanDetails.color }]}>
          <Text style={{ fontSize: 32 }}>{currentPlanDetails.icon}</Text>
          <View>
            <Text style={[typography.footnote, { color: colors.textSecondary }]}>{t('currentPlan')}</Text>
            <Text style={[typography.title2, { color: currentPlanDetails.color }]}>{currentPlanDetails.name}</Text>
          </View>
        </View>

        {/* Billing Toggle */}
        <View style={[styles.billingToggle, { backgroundColor: colors.bgSecondary, borderColor: colors.separator }]}>
          <TouchableOpacity
            style={[styles.toggleOption, billingPeriod === 'monthly' && [styles.activeToggle, { backgroundColor: colors.accent }]]}
            onPress={() => setBillingPeriod('monthly')}
          >
            <Text style={{ color: billingPeriod === 'monthly' ? '#fff' : colors.textSecondary, fontWeight: '500' }}>
              {t('monthly')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleOption, billingPeriod === 'yearly' && [styles.activeToggle, { backgroundColor: colors.accent }]]}
            onPress={() => setBillingPeriod('yearly')}
          >
            <Text style={{ color: billingPeriod === 'yearly' ? '#fff' : colors.textSecondary, fontWeight: '500' }}>
              {t('yearly')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Plan Cards */}
        <PlanCard planKey="pro" />
        <PlanCard planKey="ultra" />

        {/* Manage Subscription */}
        {(plan === 'pro' || plan === 'ultra') && (
          <TouchableOpacity style={styles.manageButton} onPress={handleManageSubscription}>
            <Text style={[typography.subheadline, { color: colors.textSecondary }]}>
              {t('manageSubscription')}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backText: { fontSize: 17 },
  currentPlanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 12,
  },
  billingToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    borderWidth: 0.5,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeToggle: {},
  planCard: {
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  features: {
    gap: 6,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subscribeButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  manageButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
});
