import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ChatRoom, RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ChatsScreen() {
  const rooms = useChatStore((s) => s.rooms);
  const fetchRooms = useChatStore((s) => s.fetchRooms);
  const currentUser = useAuthStore((s) => s.user);
  const nav = useNavigation<Nav>();

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

  const renderRoom = ({ item }: { item: ChatRoom }) => (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3 border-b border-dark-100"
      onPress={() =>
        nav.navigate('ChatRoom', {
          roomId: item.id,
          roomName: getRoomDisplayName(item),
        })
      }
    >
      <View className="w-12 h-12 rounded-full bg-primary-800 items-center justify-center mr-3">
        {getRoomAvatar(item) ? (
          <Image
            source={{ uri: getRoomAvatar(item)! }}
            className="w-12 h-12 rounded-full"
          />
        ) : (
          <Text className="text-white text-lg font-bold">
            {getRoomDisplayName(item).charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View className="flex-1">
        <View className="flex-row justify-between items-center">
          <Text className="text-white font-semibold text-base" numberOfLines={1}>
            {getRoomDisplayName(item)}
          </Text>
          <Text className="text-slate-500 text-xs">
            {formatTime(item.lastMessage?.createdAt || item.updatedAt)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center mt-1">
          <Text className="text-slate-400 text-sm flex-1 mr-2" numberOfLines={1}>
            {item.lastMessage?.content || 'No messages yet'}
          </Text>
          {(item.unreadCount ?? 0) > 0 && (
            <View className="bg-primary-600 rounded-full w-5 h-5 items-center justify-center">
              <Text className="text-white text-xs font-bold">
                {item.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-dark-200">
      <View className="px-4 pt-14 pb-4 flex-row justify-between items-center">
        <Text className="text-white text-2xl font-bold">Chats</Text>
        <TouchableOpacity
          className="bg-primary-600 w-10 h-10 rounded-full items-center justify-center"
          onPress={() => nav.navigate('NewChat')}
        >
          <Text className="text-white text-2xl leading-7">+</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        renderItem={renderRoom}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center pt-20 px-8">
            <Text className="text-slate-500 text-base text-center">
              No conversations yet.{'\n'}Tap the + button to start one.
            </Text>
          </View>
        }
      />
    </View>
  );
}
