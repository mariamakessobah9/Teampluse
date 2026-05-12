import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text } from 'react-native';
import ChatsScreen from '../screens/chat/ChatsScreen';
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';
import NewChatScreen from '../screens/chat/NewChatScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { MainTabParamList, RootStackParamList } from '../types';

// Placeholder screens
function TeamsScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-dark-200">
      <Text className="text-white text-lg">Teams - Coming Soon</Text>
    </View>
  );
}

function CallsScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-dark-200">
      <Text className="text-white text-lg">Calls - Coming Soon</Text>
    </View>
  );
}

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopColor: '#1e293b',
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarActiveTintColor: '#22c55e',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Chats"
        component={ChatsScreen}
        options={{ tabBarLabel: 'Chats' }}
      />
      <Tab.Screen
        name="Teams"
        component={TeamsScreen}
        options={{ tabBarLabel: 'Teams' }}
      />
      <Tab.Screen
        name="Calls"
        component={CallsScreen}
        options={{ tabBarLabel: 'Calls' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={TabNavigator} />
      <Stack.Screen
        name="ChatRoom"
        component={ChatRoomScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="NewChat"
        component={NewChatScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
