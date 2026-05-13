import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import api from '../../services/api';
import { useChatStore } from '../../store/useChatStore';
import { RootStackParamList, User } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function NewGroupScreen() {
  const nav = useNavigation<Nav>();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const createGroupRoom = useChatStore((s) => s.createGroupRoom);
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

  const selectedIds = useMemo(
    () => new Set(selected.map((u) => u.id)),
    [selected],
  );

  const toggleUser = (user: User) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  const canCreate =
    name.trim().length >= 2 && selected.length >= 1 && !creating;

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const room = await createGroupRoom(
        name.trim(),
        selected.map((u) => u.id),
      );
      nav.replace('ChatRoom', {
        roomId: room.id,
        roomName: room.name || name.trim(),
      });
    } catch (e: any) {
      Alert.alert(
        'Could not create group',
        e?.response?.data?.message || 'Please try again.',
      );
      setCreating(false);
    }
  };

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      {/* Header */}
      <View className="bg-surface-header dark:bg-dark-300 pt-14 pb-3 px-4 flex-row items-center">
        <TouchableOpacity onPress={() => nav.goBack()} className="mr-2">
          <Ionicons name="chevron-back" size={26} color={headerAccent} />
        </TouchableOpacity>
        <Text className="text-ink-900 dark:text-white font-bold text-lg flex-1">
          New group
        </Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={!canCreate}
          activeOpacity={0.7}
          className={`px-4 py-2 rounded-full ${
            canCreate ? 'bg-primary-600' : 'bg-ink-200 dark:bg-slate-700'
          }`}
        >
          {creating ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text
              className={`font-bold text-sm ${
                canCreate ? 'text-white' : 'text-ink-400 dark:text-slate-400'
              }`}
            >
              Create
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Group name */}
      <View className="px-4 pt-4">
        <Text className="text-ink-500 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
          Group name
        </Text>
        <View className="bg-surface-card dark:bg-dark-100 rounded-2xl px-4 py-3">
          <TextInput
            className="text-ink-900 dark:text-white text-base"
            placeholder="e.g. Marketing team"
            placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
            value={name}
            onChangeText={setName}
            maxLength={60}
          />
        </View>
      </View>

      {/* Selected chips */}
      {selected.length > 0 && (
        <View className="mt-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
          >
            {selected.map((u) => (
              <TouchableOpacity
                key={u.id}
                onPress={() => toggleUser(u)}
                activeOpacity={0.7}
                className="flex-row items-center bg-primary-100 dark:bg-primary-900 rounded-full pl-1 pr-3 py-1 mr-2"
              >
                <View className="w-6 h-6 rounded-full bg-primary-500 items-center justify-center mr-2">
                  <Text className="text-white text-xs font-bold">
                    {u.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text className="text-primary-700 dark:text-primary-200 text-sm font-semibold mr-1">
                  {u.name}
                </Text>
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={isDark ? '#86efac' : '#15803d'}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search */}
      <View className="px-4 pt-4">
        <Text className="text-ink-500 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
          Add members
        </Text>
        <View className="flex-row items-center bg-surface-card dark:bg-dark-100 rounded-2xl px-4 py-3">
          <Ionicons
            name="search"
            size={18}
            color={isDark ? '#64748b' : '#9ca3af'}
          />
          <TextInput
            className="flex-1 text-ink-900 dark:text-white text-base ml-2"
            placeholder="Search by name or email"
            placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
        </View>
      </View>

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
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <TouchableOpacity
                className="flex-row items-center px-4 py-3"
                activeOpacity={0.7}
                onPress={() => toggleUser(item)}
              >
                <View className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden mr-3">
                  {item.avatar ? (
                    <Image source={{ uri: item.avatar }} className="w-12 h-12" />
                  ) : (
                    <Text className="text-primary-700 dark:text-primary-300 text-lg font-bold">
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-ink-900 dark:text-white font-semibold text-base">
                    {item.name}
                  </Text>
                  <Text className="text-ink-400 dark:text-slate-400 text-sm">
                    {item.email}
                  </Text>
                </View>
                <View
                  className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                    isSelected
                      ? 'bg-primary-600 border-primary-600'
                      : 'border-ink-300 dark:border-slate-600'
                  }`}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={14} color="#ffffff" />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            query.trim().length < 2 ? (
              <Text className="text-ink-400 dark:text-slate-400 text-center mt-8 px-8">
                Type at least 2 characters to search teammates
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
