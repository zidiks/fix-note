import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileStackParamList } from './types';
import ProfileScreen from '../screens/profile/ProfileScreen';
import LanguageScreen from '../screens/profile/LanguageScreen';
import SubscriptionScreen from '../screens/profile/SubscriptionScreen';
import SyncSettingsScreen from '../screens/profile/SyncSettingsScreen';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen
        name="Language"
        component={LanguageScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="SyncSettings"
        component={SyncSettingsScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
