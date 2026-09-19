import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import api from '../../services/api';
import { useAuthStore } from '../../store/useAuthStore';
import { callManager, isCallSupported } from '../../services/callManager';
import { Call, RootStackParamList, User } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const formatWhen = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0)
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString();
};

const formatDuration = (seconds: number) => {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
};

const CallRow = React.memo(function CallRow({
  item,
  currentUser,
  selectionMode,
  selected,
  mutedIcon,
  headerAccent,
  onPress,
  onLongPress,
  onStartCall,
}: {
  item: Call;
  currentUser?: User | null;
  selectionMode: boolean;
  selected: boolean;
  mutedIcon: string;
  headerAccent: string;
  onPress: (call: Call) => void;
  onLongPress: (call: Call) => void;
  onStartCall: (other: Call['caller'], type: 'audio' | 'video') => void;
}) {
  const isOutgoing = item.callerId === currentUser?.id;
  const other = isOutgoing ? item.callee : item.caller;
  const missed = item.status === 'missed' && !isOutgoing;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      className={`flex-row items-center px-4 py-3 ${
        selected ? 'bg-primary-50 dark:bg-primary-900/30' : ''
      }`}
    >
      {selectionMode && (
        <View
          className={`w-6 h-6 rounded-full border-2 items-center justify-center mr-3 ${
            selected
              ? 'bg-primary-600 border-primary-600'
              : 'border-ink-300 dark:border-slate-600'
          }`}
        >
          {selected && (
            <Ionicons name="checkmark" size={14} color="#ffffff" />
          )}
        </View>
      )}

      <View className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden mr-3">
        {other?.avatar ? (
          <Image
            source={{ uri: other.avatar }}
            className="w-12 h-12"
            cachePolicy="memory-disk"
            transition={120}
          />
        ) : (
          <Text className="text-primary-700 dark:text-primary-300 text-lg font-bold">
            {(other?.name || '?').charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View className="flex-1">
        <Text
          className={`font-semibold text-base ${
            missed ? 'text-red-500' : 'text-ink-900 dark:text-white'
          }`}
          numberOfLines={1}
        >
          {other?.name || 'Unknown'}
        </Text>
        <View className="flex-row items-center mt-0.5">
          <Ionicons
            name={
              isOutgoing
                ? 'arrow-up-outline'
                : item.status === 'missed'
                ? 'close-outline'
                : 'arrow-down-outline'
            }
            size={13}
            color={missed ? '#ef4444' : mutedIcon}
          />
          <Ionicons
            name={item.type === 'video' ? 'videocam' : 'call'}
            size={12}
            color={mutedIcon}
            style={{ marginLeft: 6 }}
          />
          <Text className="text-ink-400 dark:text-slate-400 text-xs ml-1">
            {formatWhen(item.createdAt)}
            {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
          </Text>
        </View>
      </View>

      {!selectionMode && (
        <>
          <TouchableOpacity
            onPress={() => onStartCall(other, 'audio')}
            activeOpacity={0.7}
            className="p-2 mr-1"
          >
            <Ionicons name="call-outline" size={22} color={headerAccent} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onStartCall(other, 'video')}
            activeOpacity={0.7}
            className="p-2"
          >
            <Ionicons
              name="videocam-outline"
              size={22}
              color={headerAccent}
            />
          </TouchableOpacity>
        </>
      )}
    </TouchableOpacity>
  );
});

export default function CallsScreen() {
  const currentUser = useAuthStore((s) => s.user);
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [calls, setCalls] = useState<Call[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';
  const mutedIcon = isDark ? '#94a3b8' : '#4b5563';

  const load = useCallback(() => {
    api
      .get('/calls')
      .then(({ data }) => setCalls(data))
      .catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startCall = useCallback(
    async (other: Call['caller'], type: 'audio' | 'video') => {
      if (!isCallSupported()) {
        Alert.alert(
          'Calls unavailable',
          'Please update to the latest app build to make calls.',
        );
        return;
      }
      try {
        await callManager.startCall(
          { id: other.id, name: other.name, avatar: other.avatar },
          type,
        );
      } catch (e: any) {
        Alert.alert('Call failed', e?.message || 'Please try again.');
      }
    },
    [],
  );

  const handlePress = useCallback(
    (item: Call) => {
      if (selectionMode) {
        toggleSelect(item.id);
      } else {
        nav.navigate('CallDetail', { call: item });
      }
    },
    [selectionMode, toggleSelect, nav],
  );

  const handleLongPress = useCallback(
    (item: Call) => {
      if (!selectionMode) {
        setSelectionMode(true);
        setSelectedIds(new Set([item.id]));
      }
    },
    [selectionMode],
  );

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      'Delete from history',
      `Remove ${selectedIds.size} call${
        selectedIds.size > 1 ? 's' : ''
      } from your history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ids = [...selectedIds];
            setCalls((prev) => prev.filter((c) => !selectedIds.has(c.id)));
            exitSelection();
            try {
              await api.delete('/calls', { data: { ids } });
            } catch {
              load();
              Alert.alert('Failed', 'Could not delete. Please try again.');
            }
          },
        },
      ],
    );
  };

  const renderCall = useCallback(
    ({ item }: { item: Call }) => (
      <CallRow
        item={item}
        currentUser={currentUser}
        selectionMode={selectionMode}
        selected={selectedIds.has(item.id)}
        mutedIcon={mutedIcon}
        headerAccent={headerAccent}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onStartCall={startCall}
      />
    ),
    [
      currentUser,
      selectionMode,
      selectedIds,
      mutedIcon,
      headerAccent,
      handlePress,
      handleLongPress,
      startCall,
    ],
  );

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      {/* Header */}
      <View className="bg-surface-header dark:bg-dark-300 pb-3 px-4 flex-row items-center justify-between" style={{ paddingTop: insets.top + 8 }}>
        {selectionMode ? (
          <>
            <View className="flex-row items-center">
              <TouchableOpacity onPress={exitSelection} className="mr-3">
                <Ionicons name="close" size={24} color={headerAccent} />
              </TouchableOpacity>
              <Text className="text-ink-900 dark:text-white text-lg font-bold">
                {selectedIds.size} selected
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              activeOpacity={0.7}
            >
              <Ionicons
                name="trash-outline"
                size={22}
                color={selectedIds.size === 0 ? '#9ca3af' : '#ef4444'}
              />
            </TouchableOpacity>
          </>
        ) : (
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center mr-3">
              <Ionicons name="call" size={16} color="#ffffff" />
            </View>
            <Text className="text-primary-700 dark:text-primary-300 text-xl font-bold">
              Calls
            </Text>
          </View>
        )}
      </View>

      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        renderItem={renderCall}
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
              <Ionicons name="call-outline" size={28} color={headerAccent} />
            </View>
            <Text className="text-ink-900 dark:text-white font-bold text-lg text-center">
              No calls yet
            </Text>
            <Text className="text-ink-400 dark:text-slate-400 text-sm text-center mt-1">
              Start a call from any conversation.
            </Text>
          </View>
        }
      />
    </View>
  );
}
