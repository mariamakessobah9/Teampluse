import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSocket } from '../../hooks/useSocket';
import { Message, RootStackParamList } from '../../types';

type ChatRoomRoute = RouteProp<RootStackParamList, 'ChatRoom'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const EMPTY_MESSAGES: Message[] = [];
const TYPING_DEBOUNCE_MS = 2000;

const formatTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

export default function ChatRoomScreen() {
  const route = useRoute<ChatRoomRoute>();
  const nav = useNavigation<Nav>();
  const { roomId, roomName } = route.params;
  const [text, setText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const messages = useChatStore((s) => s.messages[roomId] ?? EMPTY_MESSAGES);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const setActiveRoom = useChatStore((s) => s.setActiveRoom);
  const room = useChatStore((s) => s.rooms.find((r) => r.id === roomId));
  const typingMap = useChatStore((s) => s.typingByRoom[roomId]);
  const currentUser = useAuthStore((s) => s.user);
  const { joinRoom, leaveRoom, sendMessage, sendTyping, markAsRead } = useSocket();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';
  const mutedIcon = isDark ? '#94a3b8' : '#4b5563';

  const isGroup = room?.type === 'group';

  const otherMember = useMemo(() => {
    if (!room || room.type !== 'direct') return null;
    return room.members?.find((m) => m.id !== currentUser?.id) || null;
  }, [room, currentUser?.id]);

  const typingNames = useMemo(() => {
    if (!typingMap || !room) return [] as string[];
    const ids = Object.keys(typingMap).filter((id) => id !== currentUser?.id);
    return ids
      .map((id) => room.members?.find((m) => m.id === id)?.name)
      .filter((n): n is string => Boolean(n));
  }, [typingMap, room, currentUser?.id]);

  const typingLabel =
    typingNames.length === 0
      ? null
      : typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : `${typingNames.join(', ')} are typing…`;

  const stopTyping = (currentRoomId: string) => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTyping(currentRoomId, false);
    }
  };

  useEffect(() => {
    setActiveRoom(roomId);
    joinRoom(roomId);
    fetchMessages(roomId);
    markAsRead(roomId);

    return () => {
      stopTyping(roomId);
      setActiveRoom(null);
      leaveRoom(roomId);
    };
  }, [roomId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleChangeText = (next: string) => {
    setText(next);
    if (next.length === 0) {
      stopTyping(roomId);
      return;
    }
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(roomId, true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      typingTimeoutRef.current = null;
      sendTyping(roomId, false);
    }, TYPING_DEBOUNCE_MS);
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    stopTyping(roomId);
    sendMessage(roomId, trimmed);
    setText('');
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.senderId === currentUser?.id;
    const prev = messages[index - 1];
    const showAvatar = !isMe && (!prev || prev.senderId !== item.senderId);
    const avatarUrl = item.sender?.avatar;

    return (
      <View
        className={`px-4 mb-3 flex-row ${
          isMe ? 'justify-end' : 'justify-start'
        }`}
      >
        {!isMe && (
          <View className="w-8 h-8 mr-2 rounded-full bg-primary-100 dark:bg-primary-900 items-end justify-end overflow-hidden self-end">
            {showAvatar ? (
              avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <View className="w-8 h-8 rounded-full bg-primary-200 dark:bg-primary-800 items-center justify-center">
                  <Text className="text-primary-700 dark:text-primary-200 font-bold text-xs">
                    {(item.sender?.name || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )
            ) : null}
          </View>
        )}
        <View
          className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
            isMe
              ? 'bg-primary-700 rounded-br-md'
              : 'bg-surface-bubbleIn dark:bg-dark-100 rounded-bl-md'
          }`}
        >
          {!isMe && isGroup && showAvatar && (
            <Text className="text-primary-700 dark:text-primary-300 text-xs font-bold mb-0.5">
              {item.sender?.name || 'Unknown'}
            </Text>
          )}
          <Text
            className={`text-base ${
              isMe ? 'text-white' : 'text-ink-900 dark:text-white'
            }`}
          >
            {item.content}
          </Text>
          <View className="flex-row items-center justify-end mt-1">
            <Text
              className={`text-[10px] ${
                isMe ? 'text-white/80' : 'text-ink-400 dark:text-slate-400'
              }`}
            >
              {formatTime(item.createdAt)}
            </Text>
            {isMe && (
              <Text
                className={`text-[10px] ml-1 ${
                  item.status === 'read' ? 'text-white' : 'text-white/70'
                }`}
              >
                {item.status === 'sent' ? '✓' : '✓✓'}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const presenceLabel = otherMember
    ? otherMember.isOnline
      ? 'Online'
      : 'Offline'
    : null;

  const groupSubtitle = isGroup && room
    ? `${room.members.length} member${room.members.length > 1 ? 's' : ''}`
    : null;

  const openSettings = () => {
    if (isGroup) {
      nav.navigate('GroupSettings', { roomId });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-surface-page dark:bg-dark-200"
    >
      {/* Header */}
      <View className="bg-surface-header dark:bg-dark-300 pt-14 pb-3 px-4 flex-row items-center">
        <TouchableOpacity onPress={() => nav.goBack()} className="mr-2">
          <Ionicons name="chevron-back" size={26} color={headerAccent} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={openSettings}
          disabled={!isGroup}
          activeOpacity={isGroup ? 0.7 : 1}
          className="flex-row items-center flex-1"
        >
          <View className="relative mr-3">
            <View className="w-10 h-10 rounded-full border-2 border-primary-500 items-center justify-center overflow-hidden bg-primary-100 dark:bg-primary-900">
              {(isGroup ? room?.avatar : otherMember?.avatar) ? (
                <Image
                  source={{
                    uri: (isGroup ? room?.avatar : otherMember?.avatar) as string,
                  }}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <Text className="text-primary-700 dark:text-primary-200 font-bold">
                  {(roomName || '?').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            {!isGroup && otherMember?.isOnline && (
              <View className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-primary-500 border-2 border-surface-header dark:border-dark-300" />
            )}
          </View>

          <View className="flex-1">
            <Text
              className="text-ink-900 dark:text-white font-bold text-base"
              numberOfLines={1}
            >
              {roomName}
            </Text>
            {typingLabel ? (
              <Text className="text-primary-600 dark:text-primary-300 text-xs italic">
                {typingLabel}
              </Text>
            ) : groupSubtitle ? (
              <Text className="text-ink-400 dark:text-slate-400 text-xs">
                {groupSubtitle}
              </Text>
            ) : presenceLabel ? (
              <Text
                className={`text-xs ${
                  otherMember?.isOnline
                    ? 'text-primary-600 dark:text-primary-300'
                    : 'text-ink-400 dark:text-slate-400'
                }`}
              >
                {presenceLabel}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity className="ml-3">
          <Ionicons name="call-outline" size={22} color={headerAccent} />
        </TouchableOpacity>
        <TouchableOpacity className="ml-4">
          <Ionicons name="videocam-outline" size={22} color={headerAccent} />
        </TouchableOpacity>
        <TouchableOpacity className="ml-4">
          <Ionicons name="search" size={22} color={headerAccent} />
        </TouchableOpacity>
      </View>

      {/* Date pill */}
      <View className="items-center my-3">
        <View className="bg-surface-chip dark:bg-dark-100 rounded-full px-3 py-1">
          <Text className="text-ink-500 dark:text-slate-300 text-xs font-semibold tracking-wider">
            TODAY
          </Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={{ paddingVertical: 4, paddingBottom: 12 }}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      />

      {/* Typing indicator */}
      {typingLabel && (
        <View className="px-5 pb-2 flex-row items-center">
          <View className="flex-row mr-2">
            <View className="w-1.5 h-1.5 rounded-full bg-primary-500 mr-0.5" />
            <View className="w-1.5 h-1.5 rounded-full bg-primary-500 mr-0.5" />
            <View className="w-1.5 h-1.5 rounded-full bg-primary-500" />
          </View>
          <Text className="text-primary-600 dark:text-primary-300 text-sm italic">
            {typingLabel}
          </Text>
        </View>
      )}

      {/* Input */}
      <View className="flex-row items-center px-4 py-3 bg-surface-card dark:bg-dark-300 border-t border-ink-200/50 dark:border-slate-700/50">
        <TouchableOpacity className="w-9 h-9 rounded-full bg-surface-chip dark:bg-dark-100 items-center justify-center mr-2">
          <Ionicons name="add" size={20} color={mutedIcon} />
        </TouchableOpacity>
        <TextInput
          className="flex-1 bg-surface-chip dark:bg-dark-100 text-ink-900 dark:text-white rounded-2xl px-4 py-2.5 text-base mr-2"
          placeholder="Message..."
          placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
          value={text}
          onChangeText={handleChangeText}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          className="w-10 h-10 rounded-full bg-primary-600 items-center justify-center"
          activeOpacity={0.85}
          onPress={handleSend}
        >
          <Ionicons name="send" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
