import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../theme/useTheme';
import { useAuthStore } from '../../stores/auth';
import { authApi } from '../../api/auth';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TelegramAuth'>;
};

// Telegram Login Widget is served from our backend so it has a real domain origin.
// The domain (fixnote.space) must be configured in BotFather via /setdomain.
const TELEGRAM_AUTH_URL =
  (process.env.EXPO_PUBLIC_API_URL || 'https://fixnote.space/api') + '/telegram-auth';

export default function TelegramAuthScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { saveAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      const telegramUser = JSON.parse(event.nativeEvent.data);
      setIsLoading(true);
      const response = await authApi.loginWithTelegram(telegramUser);
      await saveAuth(response.access_token, response.user);
      navigation.goBack();
    } catch {
      Alert.alert('Ошибка', 'Не удалось войти через Telegram. Попробуйте снова.');
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Text style={[styles.closeText, { color: colors.accent }]}>Закрыть</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Telegram</Text>
        <View style={styles.closeButton} />
      </View>

      {/* WebView with Telegram Login Widget */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Выполняем вход...
          </Text>
        </View>
      ) : (
        <WebView
          source={{ uri: TELEGRAM_AUTH_URL }}
          onMessage={handleMessage}
          javaScriptEnabled
          style={{ backgroundColor: colors.bgPrimary }}
        />
      )}
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
  closeButton: { width: 60 },
  closeText: { fontSize: 17 },
  title: { fontSize: 17, fontWeight: '600' },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: { fontSize: 15 },
});
