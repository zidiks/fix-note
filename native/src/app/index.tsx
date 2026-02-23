import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import RootNavigator, { navigationRef } from '../navigation/RootNavigator';
import { setNavigationRef, setupDeepLinkHandler } from '../utils/deepLink';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

export default function App() {
  useEffect(() => {
    if (navigationRef.current) {
      setNavigationRef(navigationRef.current);
    }
    const cleanup = setupDeepLinkHandler();
    return cleanup;
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer
          ref={navigationRef}
          onReady={() => {
            if (navigationRef.current) {
              setNavigationRef(navigationRef.current);
            }
          }}
        >
          <StatusBar style="auto" />
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
