import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import api from '../../services/api';
import { useChatStore } from '../../store/useChatStore';
import { RootStackParamList, User } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const UserRow = React.memo(function UserRow({
  item,
  busy,
  onPress,
}: {
  item: User;
  busy: boolean;
  onPress: (user: User) => void;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3"
      activeOpacity={0.7}
      onPress={() => onPress(item)}
      disabled={busy}
    >
      <View className="relative mr-3">
        <View className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden">
          {item.avatar ? (
            <Image
              source={{ uri: item.avatar }}
              className="w-12 h-12"
              cachePolicy="memory-disk"
              transition={120}
            />
          ) : (
            <Text className="text-primary-700 dark:text-primary-300 text-lg font-bold">
              {item.name.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-page dark:border-dark-200 ${
            item.isOnline ? 'bg-primary-500' : 'bg-ink-300 dark:bg-slate-600'
          }`}
        />
      </View>
      <View className="flex-1">
        <Text className="text-ink-900 dark:text-white font-semibold text-base">
          {item.name}
        </Text>
        <Text className="text-ink-400 dark:text-slate-400 text-sm">
          {item.email}
        </Text>
      </View>
      {busy && <ActivityIndicator color="#16a34a" />}
    </TouchableOpacity>
  );
});

export default function NewChatScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const createDirectRoom = useChatStore((s) => s.createDirectRoom);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const { data } = await api.get('/users/search', { params: { q } });
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const handleStart = useCallback(
    async (user: User) => {
      setStarting(user.id);
      try {
        const room = await createDirectRoom(user.id);
        nav.replace('ChatRoom', { roomId: room.id, roomName: user.name });
      } catch {
        setStarting(null);
      }
    },
    [createDirectRoom, nav],
  );

  const renderUser = useCallback(
    ({ item }: { item: User }) => (
      <UserRow item={item} busy={starting === item.id} onPress={handleStart} />
    ),
    [starting, handleStart],
  );

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      {/* Header */}
      <View className="bg-surface-header dark:bg-dark-300 pb-3 px-4 flex-row items-center" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity
          onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Main'))}
          className="mr-2"
        >
          <Ionicons name="chevron-back" size={26} color={headerAccent} />
        </TouchableOpacity>
        <Text className="text-ink-900 dark:text-white font-bold text-lg">
          New chat
        </Text>
      </View>

      {/* Search */}
      <View className="px-4 py-3">
        <View className="flex-row items-center bg-surface-card dark:bg-dark-100 rounded-2xl px-4 py-3">
          <Ionicons name="search" size={18} color={isDark ? '#64748b' : '#9ca3af'} />
          <TextInput
            className="flex-1 text-ink-900 dark:text-white text-base ml-2"
            placeholder="Search by name or email"
            placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoFocus
          />
        </View>
      </View>

      {/* New group entry */}
      <TouchableOpacity
        onPress={() => nav.navigate('NewGroup')}
        activeOpacity={0.7}
        className="flex-row items-center px-4 py-3"
      >
        <View className="w-12 h-12 rounded-2xl bg-primary-600 items-center justify-center mr-3">
          <Ionicons name="people" size={22} color="#ffffff" />
        </View>
        <View className="flex-1">
          <Text className="text-ink-900 dark:text-white font-semibold text-base">
            New group
          </Text>
          <Text className="text-ink-400 dark:text-slate-400 text-sm">
            Start a conversation with multiple people
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isDark ? '#64748b' : '#9ca3af'}
        />
      </TouchableOpacity>

      <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 mx-4" />

      {loading ? (
        <View className="items-center mt-6">
          <ActivityIndicator color="#16a34a" />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(u) => u.id}
          ItemSeparatorComponent={() => (
            <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 mx-4" />
          )}
          renderItem={renderUser}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={11}
          removeClippedSubviews={true}
          ListEmptyComponent={
            query.trim().length < 2 ? (
              <Text className="text-ink-400 dark:text-slate-400 text-center mt-8">
                Type at least 2 characters to search
              </Text>
            ) : (
              <Text className="text-ink-400 dark:text-slate-400 text-center mt-8">
                No users found
              </Text>
            )
          }
        />
      )}
    </View>
  );
}
