import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import ChatsScreen from '../screens/chat/ChatsScreen';
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';
import NewChatScreen from '../screens/chat/NewChatScreen';
import NewGroupScreen from '../screens/chat/NewGroupScreen';
import GroupSettingsScreen from '../screens/chat/GroupSettingsScreen';
import TeamsScreen from '../screens/chat/TeamsScreen';
import CallsScreen from '../screens/chat/CallsScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import CallDetailScreen from '../screens/CallDetailScreen';
import OrganizationScreen from '../screens/settings/OrganizationScreen';
import SearchScreen from '../screens/SearchScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { MainTabParamList, RootStackParamList } from '../types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

type TabIconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof MainTabParamList, [TabIconName, TabIconName]> = {
  Chats: ['chatbubble', 'chatbubble-outline'],
  Teams: ['people', 'people-outline'],
  Calls: ['call', 'call-outline'],
  Settings: ['settings', 'settings-outline'],
};

function TabNavigator() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? '#020617' : '#ffffff',
          borderTopColor: isDark ? '#1e293b' : '#e5e7eb',
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
        },
        tabBarActiveTintColor: '#16a34a',
        tabBarInactiveTintColor: isDark ? '#64748b' : '#9ca3af',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const [filled, outline] =
            TAB_ICONS[route.name as keyof MainTabParamList];
          return (
            <Ionicons
              name={focused ? filled : outline}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Chats" component={ChatsScreen} />
      <Tab.Screen name="Teams" component={TeamsScreen} />
      <Tab.Screen name="Calls" component={CallsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
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
      <Stack.Screen
        name="NewGroup"
        component={NewGroupScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="GroupSettings"
        component={GroupSettingsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="CallDetail"
        component={CallDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Organization"
        component={OrganizationScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Search"
        component={SearchScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
