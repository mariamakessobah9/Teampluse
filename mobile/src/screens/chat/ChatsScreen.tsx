import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { TypingActivity, useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ChatRoom, RootStackParamList, User } from '../../types';
import ChatListSkeleton from '../../components/ChatListSkeleton';
import Logo from '../../components/Logo';
import MessageTicks from '../../components/MessageTicks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// La cle sert au filtrage, le libelle a l'affichage : traduire directement les
// valeurs casserait les comparaisons plus bas.
const FILTERS = [
  { key: 'All', label: 'Toutes' },
  { key: 'Direct', label: 'Directes' },
  { key: 'Teams', label: 'Équipes' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

const getRoomDisplayName = (room: ChatRoom, currentUser?: User | null) => {
  if (room.type === 'group') return room.name || 'Groupe';
  const other = room.members?.find((m) => m.id !== currentUser?.id);
  return other?.name || 'Conversation';
};

const getRoomAvatar = (room: ChatRoom, currentUser?: User | null) => {
  if (room.avatar) return room.avatar;
  if (room.type === 'direct') {
    const other = room.members?.find((m) => m.id !== currentUser?.id);
    return other?.avatar;
  }
  return null;
};

const isOtherOnline = (room: ChatRoom, currentUser?: User | null) => {
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
  if (diffDays === 1) return 'Hier';
  return date.toLocaleDateString();
};

const lastMessageText = (room: ChatRoom, currentUser?: User | null) => {
  const m = room.lastMessage;
  if (!m) return 'Aucun message';
  if (m.deletedForEveryone) {
    return m.senderId === currentUser?.id
      ? 'Vous avez supprimé ce message'
      : 'Ce message a été supprimé';
  }
  let preview = m.content;
  if (m.type === 'image') preview = '📷 Photo';
  else if (m.type === 'file') preview = `📎 ${m.fileName || 'Document'}`;
  else if (m.type === 'voice') preview = '🎤 Message vocal';
  const first =
    m.senderId === currentUser?.id ? 'Vous' : m.sender?.name?.split(' ')[0];
  return room.type === 'group' && first ? `${first}: ${preview}` : preview;
};

/**
 * « écrit… » / « enregistre un audio… » à la place du dernier message, comme
 * sur WhatsApp. Dans un groupe, on précise qui.
 */
const activityText = (
  room: ChatRoom,
  activity: Record<string, TypingActivity> | undefined,
  currentUser?: User | null,
): string | null => {
  if (!activity) return null;
  const entry = Object.entries(activity).find(([id]) => id !== currentUser?.id);
  if (!entry) return null;
  const [userId, kind] = entry;
  const verb = kind === 'recording' ? 'enregistre un audio…' : 'écrit…';
  if (room.type !== 'group') return verb;
  const name = room.members?.find((m) => m.id === userId)?.name?.split(' ')[0];
  return name ? `${name} ${verb}` : verb;
};

const RoomRow = React.memo(function RoomRow({
  item,
  currentUser,
  activity,
  isDark,
  onPress,
  onLongPress,
}: {
  item: ChatRoom;
  currentUser?: User | null;
  activity?: Record<string, TypingActivity>;
  isDark: boolean;
  onPress: (room: ChatRoom) => void;
  onLongPress: (room: ChatRoom) => void;
}) {
  const avatar = getRoomAvatar(item, currentUser);
  const live = activityText(item, activity, currentUser);
  const last = item.lastMessage;
  const showTicks =
    !live && last && last.senderId === currentUser?.id && !last.deletedForEveryone;
  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3"
      activeOpacity={0.7}
      onLongPress={() => onLongPress(item)}
      onPress={() => onPress(item)}
    >
      <View className="mr-3">
        <View className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden">
          {avatar ? (
            <Image
              source={{ uri: avatar }}
              className="w-12 h-12"
              cachePolicy="memory-disk"
              transition={120}
            />
          ) : (
            <Text className="text-primary-700 dark:text-primary-300 text-lg font-bold">
              {getRoomDisplayName(item, currentUser).charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        {item.type === 'direct' && (
          <View
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-page dark:border-dark-200 ${
              isOtherOnline(item, currentUser)
                ? 'bg-primary-500'
                : 'bg-ink-300 dark:bg-slate-600'
            }`}
          />
        )}
      </View>

      <View className="flex-1">
        <View className="flex-row justify-between items-center">
          <Text
            className="text-ink-900 dark:text-white font-semibold text-base flex-1 mr-2"
            numberOfLines={1}
          >
            {getRoomDisplayName(item, currentUser)}
          </Text>
          <Text className="text-ink-400 dark:text-slate-400 text-xs">
            {formatTime(item.lastMessage?.createdAt || item.updatedAt)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center mt-1">
          {showTicks && (
            <View className="mr-1">
              <MessageTicks
                status={last.status}
                color={isDark ? '#94a3b8' : '#9ca3af'}
                size={16}
              />
            </View>
          )}
          <Text
            className={`text-sm flex-1 mr-2 ${
              live
                ? 'text-primary-600 dark:text-primary-300 font-medium'
                : 'text-ink-400 dark:text-slate-400'
            }`}
            numberOfLines={1}
          >
            {live ?? lastMessageText(item, currentUser)}
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

export default function ChatsScreen() {
  const rooms = useChatStore((s) => s.rooms);
  const fetchRooms = useChatStore((s) => s.fetchRooms);
  const pinRoom = useChatStore((s) => s.pinRoom);
  const unpinRoom = useChatStore((s) => s.unpinRoom);
  const clearRoom = useChatStore((s) => s.clearRoom);
  const typingByRoom = useChatStore((s) => s.typingByRoom);
  const currentUser = useAuthStore((s) => s.user);
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('All');
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';

  // Le store n'expose pas d'indicateur de chargement : sans etat local, la
  // liste vide s'affiche une fraction de seconde comme si le compte etait vide.
  const [loading, setLoading] = useState(true);

  // A chaque retour sur l'accueil : photos, noms et membres a jour, meme si
  // un evenement temps reel a ete manque pendant que l'app dormait.
  useFocusEffect(
    useCallback(() => {
      Promise.resolve(fetchRooms())
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, [fetchRooms]),
  );

  const openRoom = useCallback(
    (room: ChatRoom) =>
      nav.navigate('ChatRoom', {
        roomId: room.id,
        roomName: getRoomDisplayName(room, currentUser),
      }),
    [nav, currentUser],
  );

  const confirmClear = useCallback(
    (room: ChatRoom) => {
      Alert.alert(
        'Supprimer la conversation ?',
        'Les messages seront supprimés de votre appareil uniquement. Les autres participants les conservent.',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: () =>
              clearRoom(room.id).catch((e: any) =>
                Alert.alert(
                  'Suppression impossible',
                  e?.response?.data?.message || 'Veuillez réessayer.',
                ),
              ),
          },
        ],
      );
    },
    [clearRoom],
  );

  const handleRoomActions = useCallback(
    (room: ChatRoom) => {
      const name = getRoomDisplayName(room, currentUser);
      Alert.alert(name, undefined, [
        room.isPinned
          ? { text: 'Détacher la conversation', onPress: () => unpinRoom(room.id) }
          : { text: 'Épingler la conversation', onPress: () => pinRoom(room.id) },
        {
          text: 'Supprimer la conversation',
          style: 'destructive',
          onPress: () => confirmClear(room),
        },
        { text: 'Annuler', style: 'cancel' },
      ]);
    },
    [currentUser, pinRoom, unpinRoom, confirmClear],
  );

  const filteredRooms = rooms.filter((r) => {
    if (filter === 'Direct') return r.type === 'direct';
    if (filter === 'Teams') return r.type === 'group';
    return true;
  });

  const pinnedRooms = filteredRooms.filter((r) => r.isPinned);
  const unpinnedRooms = filteredRooms.filter((r) => !r.isPinned);

  const renderAvatarStack = (room: ChatRoom) => {
    const members = (room.members || []).filter(
      (m) => room.type === 'group' || m.id !== currentUser?.id,
    );
    const shown = members.slice(0, 3);
    const extra = members.length - shown.length;
    return (
      <View className="flex-row items-center">
        {shown.map((m, i) => (
          <View
            key={m.id}
            className={`w-9 h-9 rounded-full border-2 border-white dark:border-dark-100 overflow-hidden items-center justify-center bg-primary-200 dark:bg-primary-800 ${
              i > 0 ? '-ml-3' : ''
            }`}
          >
            {m.avatar ? (
              <Image
                source={{ uri: m.avatar }}
                className="w-9 h-9"
                cachePolicy="memory-disk"
                transition={120}
              />
            ) : (
              <Text className="text-primary-800 dark:text-primary-100 font-bold text-xs">
                {m.name.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
        ))}
        {extra > 0 && (
          <View className="w-9 h-9 rounded-full bg-primary-500 -ml-3 items-center justify-center border-2 border-white dark:border-dark-100">
            <Text className="text-white text-xs font-bold">+{extra}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderPinnedCard = (room: ChatRoom) => (
    <TouchableOpacity
      key={room.id}
      onPress={() => openRoom(room)}
      onLongPress={() => handleRoomActions(room)}
      activeOpacity={0.85}
      className="bg-surface-card dark:bg-dark-100 rounded-2xl p-4 mr-3 shadow-sm"
      style={{ width: 248 }}
    >
      <View className="flex-row items-start justify-between">
        {renderAvatarStack(room)}
        <Ionicons name="bookmark" size={20} color="#16a34a" />
      </View>
      <Text
        className="text-ink-900 dark:text-white font-bold text-base mt-3"
        numberOfLines={1}
      >
        {getRoomDisplayName(room, currentUser)}
      </Text>
      <Text
        className="text-ink-400 dark:text-slate-400 text-sm mt-1"
        numberOfLines={1}
      >
        {activityText(room, typingByRoom[room.id], currentUser) ??
          lastMessageText(room, currentUser)}
      </Text>
    </TouchableOpacity>
  );

  const renderRoom = useCallback(
    ({ item }: { item: ChatRoom }) => (
      <RoomRow
        item={item}
        currentUser={currentUser}
        activity={typingByRoom[item.id]}
        isDark={isDark}
        onPress={openRoom}
        onLongPress={handleRoomActions}
      />
    ),
    [currentUser, typingByRoom, isDark, openRoom, handleRoomActions],
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
          const active = f.key === filter;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
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
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Pinned conversations */}
      {pinnedRooms.length > 0 && (
        <View className="mb-2">
          <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-4 mb-2">
            ÉPINGLÉES
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}
          >
            {pinnedRooms.map(renderPinnedCard)}
          </ScrollView>
        </View>
      )}

      {unpinnedRooms.length > 0 && pinnedRooms.length > 0 && (
        <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-4 mt-2 mb-1">
          TOUTES LES CONVERSATIONS
        </Text>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      {/* Top header bar */}
      <View className="bg-surface-header dark:bg-dark-300 pb-3 px-4 flex-row items-center justify-between" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center">
          <View className="mr-3">
            <Logo size={32} />
          </View>
          <Text className="text-primary-700 dark:text-primary-300 text-xl font-bold">
            TeamPulse
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => nav.navigate('Search')}
        >
          <Ionicons name="search" size={22} color={headerAccent} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={unpinnedRooms}
        keyExtractor={(item) => item.id}
        renderItem={renderRoom}
        ListHeaderComponent={ListHeader}
        ItemSeparatorComponent={() => (
          <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 mx-4" />
        )}
        contentContainerStyle={{ paddingBottom: 96 }}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={11}
        removeClippedSubviews={true}
        ListEmptyComponent={
          loading ? (
            <ChatListSkeleton />
          ) : pinnedRooms.length === 0 ? (
            <View className="items-center justify-center pt-12 px-8">
              <View className="w-16 h-16 rounded-full bg-surface-chip dark:bg-dark-100 items-center justify-center mb-4">
                <Ionicons
                  name="chatbubbles-outline"
                  size={28}
                  color={isDark ? '#64748b' : '#9ca3af'}
                />
              </View>
              <Text className="text-ink-700 dark:text-slate-200 text-base font-semibold text-center">
                Aucune conversation
              </Text>
              <Text className="text-ink-400 dark:text-slate-400 text-sm text-center mt-1">
                Appuyez sur le bouton + pour en démarrer une.
              </Text>
            </View>
          ) : null
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
