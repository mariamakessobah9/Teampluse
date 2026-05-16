import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ChatRoom, RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const FILTERS = ['All', 'Direct', 'Teams'] as const;
type Filter = (typeof FILTERS)[number];

export default function ChatsScreen() {
  const rooms = useChatStore((s) => s.rooms);
  const fetchRooms = useChatStore((s) => s.fetchRooms);
  const pinRoom = useChatStore((s) => s.pinRoom);
  const unpinRoom = useChatStore((s) => s.unpinRoom);
  const currentUser = useAuthStore((s) => s.user);
  const nav = useNavigation<Nav>();
  const [filter, setFilter] = useState<Filter>('All');
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';

  useEffect(() => {
    fetchRooms();
  }, []);

  const getRoomDisplayName = (room: ChatRoom) => {
    if (room.type === 'group') return room.name || 'Group';
    const other = room.members?.find((m) => m.id !== currentUser?.id);
    return other?.name || 'Chat';
  };

  const getRoomAvatar = (room: ChatRoom) => {
    if (room.avatar) return room.avatar;
    if (room.type === 'direct') {
      const other = room.members?.find((m) => m.id !== currentUser?.id);
      return other?.avatar;
    }
    return null;
  };

  const isOtherOnline = (room: ChatRoom) => {
    if (room.type !== 'direct') return false;
    const other = room.members?.find((m) => m.id !== currentUser?.id);
    return Boolean(other?.isOnline);
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString();
  };

  const handleTogglePin = (room: ChatRoom) => {
    const name = getRoomDisplayName(room);
    Alert.alert(name, undefined, [
      { text: 'Cancel', style: 'cancel' },
      room.isPinned
        ? { text: 'Unpin conversation', onPress: () => unpinRoom(room.id) }
        : { text: 'Pin conversation', onPress: () => pinRoom(room.id) },
    ]);
  };

  const filteredRooms = rooms.filter((r) => {
    if (filter === 'Direct') return r.type === 'direct';
    if (filter === 'Teams') return r.type === 'group';
    return true;
  });

  const renderRoom = ({ item }: { item: ChatRoom }) => (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3"
      activeOpacity={0.7}
      onLongPress={() => handleTogglePin(item)}
      onPress={() =>
        nav.navigate('ChatRoom', {
          roomId: item.id,
          roomName: getRoomDisplayName(item),
        })
      }
    >
      <View className="mr-3">
        <View className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden">
          {getRoomAvatar(item) ? (
            <Image
              source={{ uri: getRoomAvatar(item)! }}
              className="w-12 h-12"
            />
          ) : (
            <Text className="text-primary-700 dark:text-primary-300 text-lg font-bold">
              {getRoomDisplayName(item).charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        {item.type === 'direct' && (
          <View
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-page dark:border-dark-200 ${
              isOtherOnline(item) ? 'bg-primary-500' : 'bg-ink-300 dark:bg-slate-600'
            }`}
          />
        )}
      </View>

      <View className="flex-1">
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center flex-1 mr-2">
            <Text
              className="text-ink-900 dark:text-white font-semibold text-base flex-shrink"
              numberOfLines={1}
            >
              {getRoomDisplayName(item)}
            </Text>
            {item.isPinned && (
              <Ionicons
                name="pin"
                size={13}
                color={isDark ? '#86efac' : '#15803d'}
                style={{ marginLeft: 5, transform: [{ rotate: '45deg' }] }}
              />
            )}
          </View>
          <Text className="text-ink-400 dark:text-slate-400 text-xs">
            {formatTime(item.lastMessage?.createdAt || item.updatedAt)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center mt-1">
          <Text
            className="text-ink-400 dark:text-slate-400 text-sm flex-1 mr-2"
            numberOfLines={1}
          >
            {item.lastMessage?.content || 'No messages yet'}
          </Text>
          {(item.unreadCount ?? 0) > 0 && (
            <View className="bg-primary-500 rounded-full min-w-[20px] h-5 px-1.5 items-center justify-center">
              <Text className="text-white text-xs font-bold">
                {item.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const ListHeader = (
    <View>
      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
      >
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              activeOpacity={0.7}
              className={`px-4 py-2 rounded-full mr-2 ${
                active
                  ? 'bg-primary-600'
                  : 'bg-surface-chip dark:bg-dark-100'
              }`}
            >
              <Text
                className={`font-semibold text-sm ${
                  active
                    ? 'text-white'
                    : 'text-ink-700 dark:text-slate-200'
                }`}
              >
                {f}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      {/* Top header bar */}
      <View className="bg-surface-header dark:bg-dark-300 pt-14 pb-3 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-ink-900 dark:bg-primary-700 items-center justify-center mr-3">
            <View className="w-2.5 h-2.5 rounded-full bg-white" />
          </View>
          <Text className="text-primary-700 dark:text-primary-300 text-xl font-bold">
            TeamPulse
          </Text>
        </View>
        <TouchableOpacity activeOpacity={0.7}>
          <Ionicons name="search" size={22} color={headerAccent} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredRooms}
        keyExtractor={(item) => item.id}
        renderItem={renderRoom}
        ListHeaderComponent={ListHeader}
        ItemSeparatorComponent={() => (
          <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 mx-4" />
        )}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListEmptyComponent={
          <View className="items-center justify-center pt-8 px-8">
            <Text className="text-ink-400 dark:text-slate-400 text-base text-center">
              No conversations yet.{'\n'}Tap the + button to start one.
            </Text>
          </View>
        }
      />

      {/* Floating action button */}
      <TouchableOpacity
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-primary-600 items-center justify-center shadow-lg"
        activeOpacity={0.85}
        onPress={() => nav.navigate('NewChat')}
        style={{
          shadowColor: '#16a34a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 6,
        }}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}
