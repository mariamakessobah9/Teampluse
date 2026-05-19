import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  useRoute,
  useNavigation,
  RouteProp,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import api from '../services/api';
import { RootStackParamList, User } from '../types';

type Route = RouteProp<RootStackParamList, 'UserProfile'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const formatJoinDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });
};

export default function UserProfileScreen() {
  const route = useRoute<Route>();
  const nav = useNavigation<Nav>();
  const { userId } = route.params;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';
  const mutedIcon = isDark ? '#94a3b8' : '#4b5563';

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/users/profile/${userId}`)
      .then(({ data }) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const initials = (user?.name || 'U')
    .split(' ')
    .map((p) => p.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      {/* Header */}
      <View className="bg-surface-header dark:bg-dark-300 pt-14 pb-3 px-4 flex-row items-center">
        <TouchableOpacity
          onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Main'))}
          className="mr-2"
        >
          <Ionicons name="chevron-back" size={26} color={headerAccent} />
        </TouchableOpacity>
        <Text className="text-ink-900 dark:text-white font-bold text-lg">
          Profile
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : !user ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-ink-500 dark:text-slate-300 text-center">
            Could not load this profile.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Avatar + name */}
          <View className="items-center mt-6 mb-4">
            <View className="relative">
              <View className="w-28 h-28 rounded-full border-[3px] border-primary-500 items-center justify-center bg-primary-100 dark:bg-primary-900 overflow-hidden">
                {user.avatar ? (
                  <Image
                    source={{ uri: user.avatar }}
                    className="w-28 h-28 rounded-full"
                  />
                ) : (
                  <Text className="text-primary-700 dark:text-primary-300 text-3xl font-bold">
                    {initials}
                  </Text>
                )}
              </View>
              <View
                className={`absolute bottom-1 right-1 w-6 h-6 rounded-full border-2 border-surface-page dark:border-dark-200 ${
                  user.isOnline
                    ? 'bg-primary-500'
                    : 'bg-ink-300 dark:bg-slate-600'
                }`}
              />
            </View>
            <Text className="text-ink-900 dark:text-white text-2xl font-bold mt-4">
              {user.name}
            </Text>
            <Text
              className={`text-sm mt-1 ${
                user.isOnline
                  ? 'text-primary-600 dark:text-primary-300'
                  : 'text-ink-400 dark:text-slate-400'
              }`}
            >
              {user.isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>

          {/* Info card */}
          <View className="mx-4 bg-surface-card dark:bg-dark-100 rounded-2xl p-4">
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-surface-chip dark:bg-dark-200 items-center justify-center mr-3">
                <Ionicons name="mail" size={18} color={mutedIcon} />
              </View>
              <View className="flex-1">
                <Text className="text-ink-400 dark:text-slate-400 text-xs font-semibold tracking-wider">
                  EMAIL ADDRESS
                </Text>
                <Text className="text-ink-900 dark:text-white text-base font-semibold mt-0.5">
                  {user.email}
                </Text>
              </View>
            </View>

            <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 my-3" />

            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-surface-chip dark:bg-dark-200 items-center justify-center mr-3">
                <Ionicons name="call" size={18} color={mutedIcon} />
              </View>
              <View className="flex-1">
                <Text className="text-ink-400 dark:text-slate-400 text-xs font-semibold tracking-wider">
                  PHONE NUMBER
                </Text>
                <Text
                  className={`text-base font-semibold mt-0.5 ${
                    user.phone
                      ? 'text-ink-900 dark:text-white'
                      : 'text-ink-400 dark:text-slate-400'
                  }`}
                >
                  {user.phone || 'Not provided'}
                </Text>
              </View>
            </View>

            <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 my-3" />

            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-surface-chip dark:bg-dark-200 items-center justify-center mr-3">
                <Ionicons name="person" size={18} color={mutedIcon} />
              </View>
              <View className="flex-1">
                <Text className="text-ink-400 dark:text-slate-400 text-xs font-semibold tracking-wider">
                  ROLE
                </Text>
                <Text className="text-ink-900 dark:text-white text-base font-semibold mt-0.5">
                  {user.role
                    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
                    : 'Member'}
                </Text>
              </View>
            </View>

            <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 my-3" />

            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-surface-chip dark:bg-dark-200 items-center justify-center mr-3">
                <Ionicons name="calendar" size={18} color={mutedIcon} />
              </View>
              <View className="flex-1">
                <Text className="text-ink-400 dark:text-slate-400 text-xs font-semibold tracking-wider">
                  MEMBER SINCE
                </Text>
                <Text className="text-ink-900 dark:text-white text-base font-semibold mt-0.5">
                  {formatJoinDate(user.createdAt)}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
