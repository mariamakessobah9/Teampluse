import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useChatStore } from '../../store/useChatStore';
import { ChatRoom, RootStackParamList } from '../../types';
import { getDiscoverableChannels, joinChannel } from '../../services/chat';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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
  if (diffDays === 1) return 'Hier';
  return date.toLocaleDateString();
};

const GroupRow = React.memo(function GroupRow({
  item,
  onPress,
}: {
  item: ChatRoom;
  onPress: (room: ChatRoom) => void;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3"
      activeOpacity={0.7}
      onPress={() => onPress(item)}
    >
      <View className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden mr-3">
        {item.avatar ? (
          <Image
            source={{ uri: item.avatar }}
            className="w-12 h-12"
            cachePolicy="memory-disk"
            transition={120}
          />
        ) : (
          <Text className="text-primary-700 dark:text-primary-300 text-lg font-bold">
            {(item.name || 'G').charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      <View className="flex-1">
        <View className="flex-row justify-between items-center">
          <Text
            className="text-ink-900 dark:text-white font-semibold text-base flex-1 mr-2"
            numberOfLines={1}
          >
            {item.name || 'Group'}
          </Text>
          <Text className="text-ink-400 dark:text-slate-400 text-xs">
            {formatTime(item.lastMessage?.createdAt || item.updatedAt)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center mt-1">
          <Text
            className="text-ink-400 dark:text-slate-400 text-sm flex-1 mr-2"
            numberOfLines={1}
          >
            {item.lastMessage
              ? `${
                  item.lastMessage.sender?.name?.split(' ')[0] || 'Someone'
                }: ${item.lastMessage.content || ''}`
              : `${item.members?.length || 0} members`}
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
});

export default function TeamsScreen() {
  const rooms = useChatStore((s) => s.rooms);
  const fetchRooms = useChatStore((s) => s.fetchRooms);
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';

  const [channels, setChannels] = useState<ChatRoom[]>([]);
  const [joining, setJoining] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      setChannels(await getDiscoverableChannels());
    } catch {
      // La decouverte est secondaire : un echec ne doit pas vider l'ecran.
      setChannels([]);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    loadChannels();
  }, [loadChannels]);

  const handleJoin = useCallback(
    async (channel: ChatRoom) => {
      setJoining(channel.id);
      try {
        await joinChannel(channel.id);
        setChannels((list) => list.filter((c) => c.id !== channel.id));
        await fetchRooms();
      } catch (err: any) {
        Alert.alert(
          'Erreur',
          err?.response?.data?.message || 'Impossible de rejoindre ce canal.',
        );
      } finally {
        setJoining(null);
      }
    },
    [fetchRooms],
  );

  const groups = rooms.filter((r) => r.type === 'group');

  const openRoom = useCallback(
    (room: ChatRoom) =>
      nav.navigate('ChatRoom', {
        roomId: room.id,
        roomName: room.name || 'Groupe',
      }),
    [nav],
  );

  const renderRoom = useCallback(
    ({ item }: { item: ChatRoom }) => (
      <GroupRow item={item} onPress={openRoom} />
    ),
    [openRoom],
  );

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      <View className="bg-surface-header dark:bg-dark-300 pb-3 px-4 flex-row items-center justify-between" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center mr-3">
            <Ionicons name="people" size={16} color="#ffffff" />
          </View>
          <Text className="text-primary-700 dark:text-primary-300 text-xl font-bold">
            Équipes
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => nav.navigate('NewGroup')}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle" size={26} color={headerAccent} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderRoom}
        ListHeaderComponent={
          channels.length > 0 ? (
            <View className="mb-2">
              <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-4 mt-2 mb-2">
                CANAUX À REJOINDRE
              </Text>
              {channels.map((c) => (
                <View
                  key={c.id}
                  className="flex-row items-center px-4 py-3 mx-4 mb-2 bg-surface-card dark:bg-dark-100 rounded-2xl"
                >
                  <View className="w-10 h-10 rounded-2xl bg-primary-100 dark:bg-primary-900 items-center justify-center mr-3">
                    <Text className="text-primary-700 dark:text-primary-300 text-lg font-bold">
                      #
                    </Text>
                  </View>
                  <View className="flex-1 mr-2">
                    <Text
                      className="text-ink-900 dark:text-white font-semibold"
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <Text
                      className="text-ink-400 dark:text-slate-400 text-xs mt-0.5"
                      numberOfLines={1}
                    >
                      {c.description ||
                        `${c.members?.length ?? 0} membre${(c.members?.length ?? 0) > 1 ? 's' : ''}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleJoin(c)}
                    disabled={joining === c.id}
                    activeOpacity={0.85}
                    className="bg-primary-600 rounded-full px-4 py-2"
                  >
                    {joining === c.id ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text className="text-white font-bold text-sm">
                        Rejoindre
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
              <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 mx-4 mt-1" />
              <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-4 mt-3">
                MES ÉQUIPES
              </Text>
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => (
          <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 mx-4" />
        )}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 96 }}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={11}
        removeClippedSubviews={true}
        ListEmptyComponent={
          <View className="items-center justify-center pt-16 px-8">
            <View className="w-16 h-16 rounded-3xl bg-primary-100 dark:bg-primary-900 items-center justify-center mb-4">
              <Ionicons name="people-outline" size={28} color={headerAccent} />
            </View>
            <Text className="text-ink-900 dark:text-white font-bold text-lg text-center">
              Aucune équipe
            </Text>
            <Text className="text-ink-400 dark:text-slate-400 text-sm text-center mt-1">
              Créez un groupe, ou rejoignez un canal ouvert de votre organisation.
            </Text>
            <TouchableOpacity
              onPress={() => nav.navigate('NewGroup')}
              activeOpacity={0.85}
              className="bg-primary-600 rounded-full px-5 py-2.5 mt-5 flex-row items-center"
            >
              <Ionicons name="add" size={18} color="#ffffff" />
              <Text className="text-white font-bold ml-1">Nouveau groupe</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <TouchableOpacity
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-primary-600 items-center justify-center shadow-lg"
        activeOpacity={0.85}
        onPress={() => nav.navigate('NewGroup')}
        style={{
          shadowColor: '#16a34a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 6,
        }}
      >
        <Ionicons name="people" size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}
