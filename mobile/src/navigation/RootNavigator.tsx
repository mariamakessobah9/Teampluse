import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import { useGlobalSocket } from '../hooks/useGlobalSocket';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';

export default function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const loadToken = useAuthStore((s) => s.loadToken);
  const loadTheme = useThemeStore((s) => s.loadTheme);
  useGlobalSocket();

  useEffect(() => {
    loadTheme();
    loadToken();
  }, []);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-page dark:bg-dark-200">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return isAuthenticated ? <MainNavigator /> : <AuthNavigator />;
}
