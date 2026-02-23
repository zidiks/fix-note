import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from './types';
import NotesStackNavigator from './NotesStackNavigator';
import ProfileStackNavigator from './ProfileStackNavigator';
import { useTheme } from '../theme/useTheme';
import { View, Text, StyleSheet } from 'react-native';

const Tab = createBottomTabNavigator<MainTabParamList>();

function NotesTabIcon({ focused, color }: { focused: boolean; color: string }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.6 }}>📝</Text>
    </View>
  );
}

function ProfileTabIcon({ focused, color }: { focused: boolean; color: string }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.6 }}>👤</Text>
    </View>
  );
}

export default function MainNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgSecondary,
          borderTopColor: colors.separator,
          borderTopWidth: 0.5,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
      }}
    >
      <Tab.Screen
        name="NotesTab"
        component={NotesStackNavigator}
        options={{
          tabBarLabel: 'Заметки',
          tabBarIcon: NotesTabIcon,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          tabBarLabel: 'Профиль',
          tabBarIcon: ProfileTabIcon,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
