import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../../navigation/types';
import { useTheme } from '../../theme/useTheme';
import { useI18n } from '../../i18n';
import { syncApi } from '../../api/sync';
import { IntegrationConnection, NotionDatabase } from '../../api/types';

type Props = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, 'SyncSettings'>;
};

export default function SyncSettingsScreen({ navigation }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();

  const [isLoading, setIsLoading] = useState(true);
  const [notionIntegration, setNotionIntegration] = useState<IntegrationConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      const { integrations } = await syncApi.getIntegrations();
      const notion = integrations.find((i) => i.provider === 'notion') ?? null;
      setNotionIntegration(notion);
    } catch {
      // Non-critical
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectNotion = async () => {
    setIsConnecting(true);
    try {
      const { authorization_url } = await syncApi.startNotionOAuth();
      const result = await WebBrowser.openAuthSessionAsync(authorization_url, 'fixnote://');

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (code && state) {
          const callbackResult = await syncApi.completeNotionOAuth(code, state);
          if (callbackResult.success) {
            if (callbackResult.available_databases && !callbackResult.has_database) {
              setDatabases(callbackResult.available_databases);
            } else {
              await loadIntegrations();
            }
          }
        }
      }
    } catch {
      Alert.alert(t('error'), t('connectionFailed'));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSelectDatabase = async (db: NotionDatabase) => {
    try {
      await syncApi.setNotionDatabase(db.id);
      setDatabases([]);
      await loadIntegrations();
    } catch {
      Alert.alert(t('error'), t('operationFailed'));
    }
  };

  const handleDisconnect = () => {
    Alert.alert(t('disconnect'), 'Отключить Notion?', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('disconnect'),
        style: 'destructive',
        onPress: async () => {
          await syncApi.disconnectIntegration('notion');
          setNotionIntegration(null);
        },
      },
    ]);
  };

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    try {
      const result = await syncApi.syncAllNotes();
      Alert.alert(
        t('allUpToDate'),
        t('syncedCount', { count: result.synced }) +
          (result.failed > 0 ? '\n' + t('failedCount', { count: result.failed }) : '')
      );
    } catch {
      Alert.alert(t('error'), t('operationFailed'));
    } finally {
      setIsSyncingAll(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backText, { color: colors.accent }]}>← {t('back')}</Text>
        </TouchableOpacity>
        <Text style={[typography.headline, { color: colors.textPrimary }]}>{t('syncSettings')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16 }}>
        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
        ) : (
          <>
            {/* Notion Card */}
            <View style={[styles.integrationCard, { backgroundColor: colors.bgSecondary, borderColor: colors.separator }]}>
              <View style={styles.integrationHeader}>
                <Text style={{ fontSize: 28 }}>📓</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.headline, { color: colors.textPrimary }]}>Notion</Text>
                  <Text style={[typography.caption1, { color: notionIntegration?.is_active ? colors.success : colors.textTertiary }]}>
                    {notionIntegration?.is_active ? t('connected') : t('connect')}
                  </Text>
                </View>
                {notionIntegration?.is_active ? (
                  <TouchableOpacity onPress={handleDisconnect} style={[styles.actionButton, { borderColor: colors.destructive }]}>
                    <Text style={[typography.footnote, { color: colors.destructive }]}>{t('disconnect')}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleConnectNotion}
                    disabled={isConnecting}
                    style={[styles.actionButton, { borderColor: colors.accent }]}
                  >
                    {isConnecting ? (
                      <ActivityIndicator color={colors.accent} size="small" />
                    ) : (
                      <Text style={[typography.footnote, { color: colors.accent }]}>{t('connect')}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {notionIntegration?.is_active && (
                <View style={{ gap: 8, marginTop: 12 }}>
                  {notionIntegration.workspace_name ? (
                    <Text style={[typography.subheadline, { color: colors.textSecondary }]}>
                      Workspace: {notionIntegration.workspace_name}
                    </Text>
                  ) : null}
                  {notionIntegration.database_name ? (
                    <Text style={[typography.subheadline, { color: colors.textSecondary }]}>
                      База: {notionIntegration.database_name}
                    </Text>
                  ) : null}
                  {notionIntegration.last_sync_at ? (
                    <Text style={[typography.caption1, { color: colors.textTertiary }]}>
                      {t('lastSync')}: {new Date(notionIntegration.last_sync_at).toLocaleString('ru-RU')}
                    </Text>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.syncAllButton, { backgroundColor: colors.accent }]}
                    onPress={handleSyncAll}
                    disabled={isSyncingAll}
                  >
                    {isSyncingAll ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.syncAllText}>{t('syncAllNotes')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Database selection */}
            {databases.length > 0 && (
              <View style={[styles.dbSection, { backgroundColor: colors.bgSecondary, borderColor: colors.separator }]}>
                <Text style={[typography.headline, { color: colors.textPrimary, marginBottom: 8 }]}>
                  {t('selectDatabase')}
                </Text>
                {databases.map((db) => (
                  <TouchableOpacity
                    key={db.id}
                    style={[styles.dbItem, { borderBottomColor: colors.separator }]}
                    onPress={() => handleSelectDatabase(db)}
                  >
                    <Text style={[typography.body, { color: colors.textPrimary }]}>{db.name}</Text>
                    <Text style={{ color: colors.textTertiary }}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Obsidian and Anytype coming soon */}
            {['Obsidian', 'Anytype'].map((name) => (
              <View
                key={name}
                style={[styles.integrationCard, { backgroundColor: colors.bgSecondary, borderColor: colors.separator, opacity: 0.5 }]}
              >
                <View style={styles.integrationHeader}>
                  <Text style={{ fontSize: 28 }}>{name === 'Obsidian' ? '🔮' : '🔷'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.headline, { color: colors.textPrimary }]}>{name}</Text>
                    <Text style={[typography.caption1, { color: colors.textTertiary }]}>{t('comingSoon')}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}
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
  integrationCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 0.5,
  },
  integrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  syncAllButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  syncAllText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  dbSection: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 0.5,
  },
  dbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
});
