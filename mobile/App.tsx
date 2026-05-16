import './global.css';
import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';

export default function App() {
  // Preload the icon font so glyphs render reliably in dev/release builds.
  const [fontsLoaded] = useFonts(Ionicons.font);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="light" />
        <RootNavigator />
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
