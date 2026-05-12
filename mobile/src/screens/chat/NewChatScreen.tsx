import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import api from '../../services/api';
import { useChatStore } from '../../store/useChatStore';
import { RootStackParamList, User } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function NewChatScreen() {
  const nav = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const createDirectRoom = useChatStore((s) => s.createDirectRoom);

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

  const handleStart = async (user: User) => {
    setStarting(user.id);
    try {
      const room = await createDirectRoom(user.id);
      nav.replace('ChatRoom', { roomId: room.id, roomName: user.name });
    } catch {
      setStarting(null);
    }
  };

  return (
    <View className="flex-1 bg-dark-200">
      <View className="flex-row items-center px-4 pt-14 pb-3 bg-dark-300 border-b border-dark-100">
        <TouchableOpacity onPress={() => nav.goBack()} className="mr-3">
          <Text className="text-primary-500 text-2xl">←</Text>
        </TouchableOpacity>
        <Text className="text-white font-semibold text-lg">New chat</Text>
      </View>

      <View className="px-4 py-3">
        <TextInput
          className="bg-dark-100 text-white rounded-xl px-4 py-3 text-base"
          placeholder="Search by name or email"
          placeholderTextColor="#64748b"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoFocus
        />
      </View>

      {loading ? (
        <View className="items-center mt-6">
          <ActivityIndicator color="#22c55e" />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-row items-center px-4 py-3 border-b border-dark-100"
              onPress={() => handleStart(item)}
              disabled={starting === item.id}
            >
              <View className="w-12 h-12 rounded-full bg-primary-800 items-center justify-center mr-3">
                <Text className="text-white text-lg font-bold">
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-white font-semibold text-base">{item.name}</Text>
                <Text className="text-slate-400 text-sm">{item.email}</Text>
              </View>
              {starting === item.id ? (
                <ActivityIndicator color="#22c55e" />
              ) : item.isOnline ? (
                <View className="w-2.5 h-2.5 rounded-full bg-green-500" />
              ) : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.trim().length < 2 ? (
              <Text className="text-slate-500 text-center mt-8">
                Type at least 2 characters to search
              </Text>
            ) : (
              <Text className="text-slate-500 text-center mt-8">No users found</Text>
            )
          }
        />
      )}
    </View>
  );
}
