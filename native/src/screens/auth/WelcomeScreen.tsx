import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../theme/useTheme';
import { useAuthStore } from '../../stores/auth';
import { authApi } from '../../api/auth';

// Lazy accessor — avoids TurboModule crash in Expo Go
function getGoogleSignin() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    });
    return GoogleSignin;
  } catch {
    return null;
  }
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Welcome'>;
};

export default function WelcomeScreen({ navigation }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { saveAuth } = useAuthStore();
  const [loading, setLoading] = useState<'apple' | 'google' | 'telegram' | null>(null);

  const handleAppleAuth = async () => {
    setLoading('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const response = await authApi.loginWithApple({
        identity_token: credential.identityToken!,
        user_data: {
          email: credential.email,
          fullName: credential.fullName,
        },
      });
      await saveAuth(response.access_token, response.user);
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Ошибка', 'Не удалось войти через Apple');
      }
    } finally {
      setLoading(null);
    }
  };

  const handleGoogleAuth = async () => {
    const GoogleSignin = getGoogleSignin();
    if (!GoogleSignin) {
      Alert.alert('Недоступно', 'Google Sign-In недоступен в Expo Go. Используй dev build.');
      return;
    }
    setLoading('google');
    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const response = await authApi.loginWithGoogle({ id_token: tokens.idToken! });
      await saveAuth(response.access_token, response.user);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось войти через Google');
    } finally {
      setLoading(null);
    }
  };

  const handleTelegramAuth = () => {
    navigation.navigate('TelegramAuth');
  };

  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
    },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    logo: {
      fontSize: 72,
      marginBottom: spacing.lg,
    },
    title: {
      ...typography.largeTitle,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    subtitle: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.xxxl,
    },
    buttonsContainer: {
      width: '100%',
      gap: spacing.md,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 52,
      borderRadius: 14,
      gap: spacing.sm,
    },
    appleButton: {
      backgroundColor: colors.textPrimary,
    },
    googleButton: {
      backgroundColor: colors.bgSecondary,
      borderWidth: 1,
      borderColor: colors.separator,
    },
    telegramButton: {
      backgroundColor: '#2AABEE',
    },
    buttonText: {
      ...typography.headline,
      color: '#fff',
    },
    googleButtonText: {
      ...typography.headline,
      color: colors.textPrimary,
    },
    buttonIcon: {
      fontSize: 20,
    },
  });

  return (
    <SafeAreaView style={s.container}>
      <View style={s.content}>
        <Text style={s.logo}>🎙️</Text>
        <Text style={s.title}>FixNote</Text>
        <Text style={s.subtitle}>Голосовые заметки с AI</Text>

        <View style={s.buttonsContainer}>
          {/* Apple Sign In (iOS only) */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[s.button, s.appleButton]}
              onPress={handleAppleAuth}
              disabled={loading !== null}
            >
              {loading === 'apple' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={s.buttonIcon}></Text>
                  <Text style={s.buttonText}>Войти через Apple</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Google Sign In */}
          <TouchableOpacity
            style={[s.button, s.googleButton]}
            onPress={handleGoogleAuth}
            disabled={loading !== null}
          >
            {loading === 'google' ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                <Text style={s.buttonIcon}>🇬</Text>
                <Text style={s.googleButtonText}>Войти через Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Telegram Sign In */}
          <TouchableOpacity
            style={[s.button, s.telegramButton]}
            onPress={handleTelegramAuth}
            disabled={loading !== null}
          >
            <Text style={s.buttonIcon}>✈️</Text>
            <Text style={s.buttonText}>Войти через Telegram</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
