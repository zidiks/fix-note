import React, { useEffect, useRef } from 'react';
import { NavigationContainerRef, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useAuthStore } from '../stores/auth';
import { setUnauthorizedHandler } from '../api/client';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import TelegramAuthScreen from '../screens/auth/TelegramAuthScreen';
import MainNavigator from './MainNavigator';
import SharedNoteScreen from '../screens/notes/SharedNoteScreen';
import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isLoading, loadFromStorage, clearAuth } = useAuthStore();
  const { colors } = useTheme();

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await clearAuth();
    });
  }, [clearAuth]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <>
          <Stack.Screen name="Main" component={MainNavigator} />
          <Stack.Screen
            name="SharedNote"
            component={SharedNoteScreen}
            options={{ presentation: 'modal' }}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen
            name="TelegramAuth"
            component={TelegramAuthScreen}
            options={{ presentation: 'modal' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
