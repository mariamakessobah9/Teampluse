import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';

export default function RootNavigator() {
  const { isAuthenticated, isLoading, loadToken } = useAuthStore();

  useEffect(() => {
    loadToken();
  }, []);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-dark-200">
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  return isAuthenticated ? <MainNavigator /> : <AuthNavigator />;
}
