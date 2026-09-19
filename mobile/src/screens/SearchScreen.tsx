import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { searchMessages, MessageHit } from '../services/chat';
import api from '../services/api';
import { RootStackParamList, User } from '../types';
import { useAuthStore } from '../store/useAuthStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Laisse le temps de finir de taper avant d'interroger le serveur. */
const DEBOUNCE_MS = 300;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });

export default function SearchScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';
  const mutedIcon = isDark ? '#94a3b8' : '#9ca3af';
  const currentUser = useAuthStore((s) => s.user);

  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<User[]>([]);
  const [messages, setMessages] = useState<MessageHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Identifie la requête en cours : une réponse lente ne doit pas écraser le
  // résultat d'une recherche plus récente.
  const latest = useRef(0);

  const run = useCallback(async (q: string) => {
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const [users, hits] = await Promise.all([
        api
          .get('/users/search', { params: { q } })
          .then((r) => r.data as User[])
          .catch(() => [] as User[]),
        searchMessages(q).catch(() => [] as MessageHit[]),
      ]);
      if (ticket !== latest.current) return;
      setPeople(users);
      setMessages(hits);
    } finally {
      if (ticket === latest.current) {
        setLoading(false);
        setSearched(true);
      }
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      latest.current++;
      setPeople([]);
      setMessages([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => run(q), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, run]);

  const roomTitle = (hit: MessageHit) => {
    const room = hit.chatRoom;
    if (!room) return 'Conversation';
    if (room.type === 'group') return room.name || 'Groupe';
    const other = room.members?.find((m) => m.id !== currentUser?.id);
    return other?.name || 'Conversation';
  };

  const empty = searched && !loading && !people.length && !messages.length;

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      <View
        className="bg-surface-header dark:bg-dark-300 pb-3 px-4 flex-row items-center"
        style={{ paddingTop: insets.top + 8 }}
      >
        <TouchableOpacity
          onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Main'))}
          className="mr-2"
        >
          <Ionicons name="chevron-back" size={26} color={headerAccent} />
        </TouchableOpacity>
        <View className="flex-1 flex-row items-center bg-surface-card dark:bg-dark-100 rounded-full px-3 py-2">
          <Ionicons name="search" size={18} color={mutedIcon} />
          <TextInput
            className="flex-1 text-ink-900 dark:text-white text-base ml-2"
            placeholder="Rechercher un message ou un collègue"
            placeholderTextColor={mutedIcon}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={mutedIcon} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {loading && (
          <View className="items-center pt-8">
            <ActivityIndicator color="#16a34a" />
          </View>
        )}

        {query.trim().length < 2 && !loading && (
          <View className="items-center pt-16 px-8">
            <View className="w-16 h-16 rounded-full bg-surface-chip dark:bg-dark-100 items-center justify-center mb-4">
              <Ionicons name="search" size={28} color={mutedIcon} />
            </View>
            <Text className="text-ink-400 dark:text-slate-400 text-sm text-center">
              Saisissez au moins deux caractères.{'\n'}
              La recherche ne porte que sur vos conversations.
            </Text>
          </View>
        )}

        {empty && (
          <View className="items-center pt-16 px-8">
            <Text className="text-ink-700 dark:text-slate-200 text-base font-semibold">
              Aucun résultat
            </Text>
            <Text className="text-ink-400 dark:text-slate-400 text-sm text-center mt-1">
              Aucun message ni collègue ne correspond à « {query.trim()} ».
            </Text>
          </View>
        )}

        {people.length > 0 && (
          <>
            <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-6 mt-4 mb-2">
              PERSONNES
            </Text>
            <View className="mx-4 bg-surface-card dark:bg-dark-100 rounded-2xl overflow-hidden">
              {people.map((u, i) => (
                <TouchableOpacity
                  key={u.id}
                  activeOpacity={0.7}
                  onPress={() => nav.navigate('UserProfile', { userId: u.id })}
                  className={`flex-row items-center px-4 py-3 ${
                    i > 0
                      ? 'border-t border-ink-200/40 dark:border-slate-700/50'
                      : ''
                  }`}
                >
                  <View className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden mr-3">
                    {u.avatar ? (
                      <Image
                        source={{ uri: u.avatar }}
                        className="w-10 h-10"
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <Text className="text-primary-700 dark:text-primary-300 font-bold">
                        {u.name.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-ink-900 dark:text-white font-semibold"
                      numberOfLines={1}
                    >
                      {u.name}
                    </Text>
                    <Text
                      className="text-ink-400 dark:text-slate-400 text-xs mt-0.5"
                      numberOfLines={1}
                    >
                      {u.email}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={mutedIcon} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {messages.length > 0 && (
          <>
            <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-6 mt-5 mb-2">
              MESSAGES
            </Text>
            <View className="mx-4 bg-surface-card dark:bg-dark-100 rounded-2xl overflow-hidden">
              {messages.map((m, i) => (
                <TouchableOpacity
                  key={m.id}
                  activeOpacity={0.7}
                  onPress={() =>
                    nav.navigate('ChatRoom', {
                      roomId: m.chatRoomId,
                      roomName: roomTitle(m),
                    })
                  }
                  className={`px-4 py-3 ${
                    i > 0
                      ? 'border-t border-ink-200/40 dark:border-slate-700/50'
                      : ''
                  }`}
                >
                  <View className="flex-row items-center justify-between mb-1">
                    <Text
                      className="text-ink-900 dark:text-white font-semibold text-sm flex-1 mr-2"
                      numberOfLines={1}
                    >
                      {roomTitle(m)}
                    </Text>
                    <Text className="text-ink-400 dark:text-slate-400 text-xs">
                      {formatDate(m.createdAt)}
                    </Text>
                  </View>
                  <Text
                    className="text-ink-500 dark:text-slate-300 text-sm"
                    numberOfLines={2}
                  >
                    <Text className="font-semibold">
                      {m.sender?.name?.split(' ')[0] ?? '—'} :{' '}
                    </Text>
                    {m.content}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
