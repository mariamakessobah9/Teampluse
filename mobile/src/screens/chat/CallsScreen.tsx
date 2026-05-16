import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import api from '../../services/api';
import { useAuthStore } from '../../store/useAuthStore';
import { callManager, isCallSupported } from '../../services/callManager';
import { Call } from '../../types';

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

export default function CallsScreen() {
  const currentUser = useAuthStore((s) => s.user);
  const [calls, setCalls] = useState<Call[]>([]);
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

  const startCall = async (
    other: Call['caller'],
    type: 'audio' | 'video',
  ) => {
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
  };

  const renderCall = ({ item }: { item: Call }) => {
    const isOutgoing = item.callerId === currentUser?.id;
    const other = isOutgoing ? item.callee : item.caller;
    const missed = item.status === 'missed' && !isOutgoing;

    return (
      <View className="flex-row items-center px-4 py-3">
        <View className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden mr-3">
          {other?.avatar ? (
            <Image source={{ uri: other.avatar }} className="w-12 h-12" />
          ) : (
            <Text className="text-primary-700 dark:text-primary-300 text-lg font-bold">
              {(other?.name || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        <View className="flex-1">
          <Text
            className={`font-semibold text-base ${
              missed
                ? 'text-red-500'
                : 'text-ink-900 dark:text-white'
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
            <Text className="text-ink-400 dark:text-slate-400 text-xs ml-1">
              {formatWhen(item.createdAt)}
              {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => startCall(other, 'audio')}
          activeOpacity={0.7}
          className="p-2 mr-1"
        >
          <Ionicons name="call-outline" size={22} color={headerAccent} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => startCall(other, 'video')}
          activeOpacity={0.7}
          className="p-2"
        >
          <Ionicons name="videocam-outline" size={22} color={headerAccent} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      <View className="bg-surface-header dark:bg-dark-300 pt-14 pb-3 px-4 flex-row items-center">
        <View className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center mr-3">
          <Ionicons name="call" size={16} color="#ffffff" />
        </View>
        <Text className="text-primary-700 dark:text-primary-300 text-xl font-bold">
          Calls
        </Text>
      </View>

      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        renderItem={renderCall}
        ItemSeparatorComponent={() => (
          <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 mx-4" />
        )}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 96 }}
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
