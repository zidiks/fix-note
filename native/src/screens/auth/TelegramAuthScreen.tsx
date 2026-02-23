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

// The Telegram Login Widget HTML page
// Replace YOUR_BOT_USERNAME with your actual bot's username
const BOT_USERNAME = process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME || 'FixNoteBot';
const REDIRECT_URL = 'https://fixnote.space/telegram-auth-callback'; // Unused, we handle via postMessage

const TELEGRAM_AUTH_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telegram Login</title>
  <style>
    body {
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f0f0f2;
      font-family: -apple-system, sans-serif;
    }
    .container {
      text-align: center;
      padding: 32px;
    }
    h2 { color: #29333F; margin-bottom: 24px; }
    p { color: #8C9198; margin-bottom: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Войти через Telegram</h2>
    <p>Нажмите кнопку ниже, чтобы войти через ваш аккаунт Telegram</p>
    <script
      async
      src="https://telegram.org/js/telegram-widget.js?22"
      data-telegram-login="${BOT_USERNAME}"
      data-size="large"
      data-radius="10"
      data-onauth="onTelegramAuth(user)"
      data-request-access="write">
    </script>
    <script>
      function onTelegramAuth(user) {
        window.ReactNativeWebView.postMessage(JSON.stringify(user));
      }
    </script>
  </div>
</body>
</html>
`;

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
          source={{ html: TELEGRAM_AUTH_HTML }}
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
