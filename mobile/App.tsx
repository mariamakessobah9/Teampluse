import './global.css';
// Doit preceder tout composant qui rend une <Image> d'expo-image.
import './src/lib/nativewind-interop';
import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';

function ThemedStatusBar() {
  // Les ecrans passent du clair au sombre : une barre figee en `light`
  // devient illisible sur les fonds clairs.
  const { colorScheme } = useColorScheme();
  return <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  // Preload the icon font so glyphs render reliably in dev/release builds.
  const [fontsLoaded] = useFonts(Ionicons.font);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Fournit les insets aux en-tetes : sans ce provider, useSafeAreaInsets
          renvoie zero partout et les titres passent sous l'encoche. */}
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef}>
          <ThemedStatusBar />
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
