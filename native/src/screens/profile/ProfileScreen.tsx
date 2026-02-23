import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../../navigation/types';
import { useTheme } from '../../theme/useTheme';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import { useSubscription, PLAN_DETAILS } from '../../stores/subscription';

type Props = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, 'Profile'>;
};

export default function ProfileScreen({ navigation }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();
  const { user, clearAuth } = useAuthStore();
  const { subscription, fetchSubscription } = useSubscription();

  useEffect(() => {
    fetchSubscription();
  }, []);

  const handleSignOut = () => {
    Alert.alert(t('signOut'), t('signOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('signOut'), style: 'destructive', onPress: () => clearAuth() },
    ]);
  };

  const plan = subscription?.plan ?? 'free';
  const planDetails = PLAN_DETAILS[plan];

  const MenuItem = ({
    label,
    value,
    onPress,
    accent,
  }: {
    label: string;
    value?: string;
    onPress: () => void;
    accent?: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.menuItem, { borderBottomColor: colors.separator }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[typography.body, { color: accent ? colors.accent : colors.textPrimary }]}>
        {label}
      </Text>
      {value ? (
        <Text style={[typography.body, { color: colors.textSecondary }]}>{value} ›</Text>
      ) : (
        <Text style={[typography.body, { color: colors.textTertiary }]}>›</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <Text style={[typography.largeTitle, { color: colors.textPrimary }]}>{t('profile')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* User Card */}
        <View style={[styles.userCard, { backgroundColor: colors.bgSecondary }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={[typography.headline, { color: colors.textPrimary }]}>
              {user?.display_name || user?.first_name || 'Пользователь'}
            </Text>
            {user?.username ? (
              <Text style={[typography.subheadline, { color: colors.textSecondary }]}>
                @{user.username}
              </Text>
            ) : null}
          </View>
          {/* Plan Badge */}
          <View style={[styles.planBadge, { backgroundColor: planDetails.color + '20' }]}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: planDetails.color }}>
              {planDetails.icon} {planDetails.name}
            </Text>
          </View>
        </View>

        {/* Menu */}
        <View style={[styles.section, { backgroundColor: colors.bgSecondary, borderColor: colors.separator }]}>
          <MenuItem
            label={t('subscription')}
            value={planDetails.name}
            onPress={() => navigation.navigate('Subscription')}
          />
          <MenuItem
            label={t('syncSettings')}
            onPress={() => navigation.navigate('SyncSettings')}
          />
          <MenuItem
            label={t('language')}
            onPress={() => navigation.navigate('Language')}
          />
        </View>

        {/* Sign Out */}
        <View style={[styles.section, { backgroundColor: colors.bgSecondary, borderColor: colors.separator }]}>
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomWidth: 0 }]}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Text style={[typography.body, { color: colors.destructive }]}>{t('signOut')}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24 },
  userInfo: { flex: 1 },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
});
