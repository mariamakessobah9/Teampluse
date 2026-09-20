import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import api from '../services/api';
import { callManager, isCallSupported } from '../services/callManager';
import { useAuthStore } from '../store/useAuthStore';
import { RootStackParamList, User } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ContactRow = React.memo(function ContactRow({
  item,
  accent,
  onCall,
}: {
  item: User;
  accent: string;
  onCall: (user: User, type: 'audio' | 'video') => void;
}) {
  return (
    <View className="flex-row items-center px-4 py-3">
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
        <Text
          className="text-ink-900 dark:text-white font-semibold text-base"
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text
          className="text-ink-400 dark:text-slate-400 text-sm"
          numberOfLines={1}
        >
          {item.isOnline ? 'En ligne' : item.email}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => onCall(item, 'audio')}
        activeOpacity={0.7}
        accessibilityLabel={`Appeler ${item.name}`}
        className="p-2 mr-1"
      >
        <Ionicons name="call-outline" size={22} color={accent} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onCall(item, 'video')}
        activeOpacity={0.7}
        accessibilityLabel={`Appel vidéo avec ${item.name}`}
        className="p-2"
      >
        <Ionicons name="videocam-outline" size={22} color={accent} />
      </TouchableOpacity>
    </View>
  );
});

/**
 * Choix du correspondant pour un nouvel appel.
 *
 * L'onglet Appels ne listait que l'historique : sans historique, aucun moyen
 * de passer un premier appel.
 */
export default function NewCallScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((s) => s.user);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';

  // Sans recherche, on liste l'annuaire de l'organisation : c'est le cas
  // courant, devoir taper un nom pour passer un appel serait absurde.
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const { data } =
          q.length >= 2
            ? await api.get('/users/search', { params: { q } })
            : await api.get('/organizations/me/members');
        if (cancelled) return;
        setResults(
          (data as User[]).filter(
            (u) =>
              u.id !== currentUser?.id &&
              u.isActive !== false &&
              u.isVerified !== false,
          ),
        );
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, q ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, currentUser?.id]);

  const handleCall = useCallback(
    async (user: User, type: 'audio' | 'video') => {
      if (!isCallSupported()) {
        Alert.alert(
          'Appels indisponibles',
          "Cette version de l'application ne prend pas en charge les appels.",
        );
        return;
      }
      try {
        await callManager.startCall(
          { id: user.id, name: user.name, avatar: user.avatar },
          type,
        );
        if (nav.canGoBack()) nav.goBack();
      } catch (e: any) {
        Alert.alert(
          "Impossible d'appeler",
          e?.message || 'Veuillez réessayer.',
        );
      }
    },
    [nav],
  );

  const renderItem = useCallback(
    ({ item }: { item: User }) => (
      <ContactRow item={item} accent={headerAccent} onCall={handleCall} />
    ),
    [headerAccent, handleCall],
  );

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      <View
        className="bg-surface-header dark:bg-dark-300 pb-3 px-4 flex-row items-center"
        style={{ paddingTop: insets.top + 8 }}
      >
        <TouchableOpacity
          onPress={() =>
            nav.canGoBack() ? nav.goBack() : nav.navigate('Main')
          }
          className="mr-2"
        >
          <Ionicons name="chevron-back" size={26} color={headerAccent} />
        </TouchableOpacity>
        <Text className="text-ink-900 dark:text-white font-bold text-lg">
          Nouvel appel
        </Text>
      </View>

      <View className="px-4 py-3">
        <View className="flex-row items-center bg-surface-card dark:bg-dark-100 rounded-2xl px-4 py-3">
          <Ionicons
            name="search"
            size={18}
            color={isDark ? '#64748b' : '#9ca3af'}
          />
          <TextInput
            className="flex-1 text-ink-900 dark:text-white text-base ml-2"
            placeholder="Rechercher un contact"
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
          renderItem={renderItem}
          ItemSeparatorComponent={() => (
            <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 mx-4" />
          )}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={11}
          removeClippedSubviews={true}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={
            <Text className="text-ink-400 dark:text-slate-400 text-center mt-8 px-8">
              Aucun contact trouvé.
            </Text>
          }
        />
      )}
    </View>
  );
}
