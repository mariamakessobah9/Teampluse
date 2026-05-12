import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSocket } from '../../hooks/useSocket';
import { Message, RootStackParamList } from '../../types';

type ChatRoomRoute = RouteProp<RootStackParamList, 'ChatRoom'>;

const EMPTY_MESSAGES: Message[] = [];

export default function ChatRoomScreen() {
  const route = useRoute<ChatRoomRoute>();
  const nav = useNavigation();
  const { roomId, roomName } = route.params;
  const [text, setText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const messages = useChatStore((s) => s.messages[roomId] ?? EMPTY_MESSAGES);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const setActiveRoom = useChatStore((s) => s.setActiveRoom);
  const currentUser = useAuthStore((s) => s.user);
  const { joinRoom, leaveRoom, sendMessage, markAsRead } = useSocket();

  useEffect(() => {
    setActiveRoom(roomId);
    joinRoom(roomId);
    fetchMessages(roomId);
    markAsRead(roomId);

    return () => {
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

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage(roomId, trimmed);
    setText('');
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.senderId === currentUser?.id;

    return (
      <View
        className={`px-4 py-1 ${isMe ? 'items-end' : 'items-start'}`}
      >
        {!isMe && (
          <Text className="text-slate-500 text-xs mb-1 ml-1">
            {item.sender?.name}
          </Text>
        )}
        <View
          className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
            isMe ? 'bg-primary-600 rounded-tr-sm' : 'bg-dark-100 rounded-tl-sm'
          }`}
        >
          <Text className="text-white text-base">{item.content}</Text>
          <View className="flex-row items-center justify-end mt-1">
            <Text className="text-slate-400 text-[10px]">
              {formatTime(item.createdAt)}
            </Text>
            {isMe && (
              <Text className="text-slate-400 text-[10px] ml-1">
                {item.status === 'read'
                  ? '✓✓'
                  : item.status === 'delivered'
                  ? '✓✓'
                  : '✓'}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-dark-200"
    >
      {/* Header */}
      <View className="flex-row items-center px-4 pt-14 pb-3 bg-dark-300 border-b border-dark-100">
        <TouchableOpacity onPress={() => nav.goBack()} className="mr-3">
          <Text className="text-primary-500 text-2xl">←</Text>
        </TouchableOpacity>
        <View>
          <Text className="text-white font-semibold text-lg">{roomName}</Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={{ paddingVertical: 8 }}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      />

      {/* Input */}
      <View className="flex-row items-center px-4 py-3 bg-dark-300 border-t border-dark-100">
        <TextInput
          className="flex-1 bg-dark-100 text-white rounded-full px-4 py-3 text-base mr-3"
          placeholder="Type a message..."
          placeholderTextColor="#64748b"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          className="bg-primary-600 w-11 h-11 rounded-full items-center justify-center"
          onPress={handleSend}
        >
          <Text className="text-white text-lg">↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
