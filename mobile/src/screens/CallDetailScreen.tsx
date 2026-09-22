import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import {
  useRoute,
  useNavigation,
  RouteProp,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { callManager, isCallSupported } from '../services/callManager';
import { summarizeCall } from '../utils/callHistory';
import { RootStackParamList } from '../types';

type Route = RouteProp<RootStackParamList, 'CallDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const day = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return { day, time };
};

const formatDuration = (seconds: number) => {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
};

export default function CallDetailScreen() {
  const route = useRoute<Route>();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { call } = route.params;
  const currentUser = useAuthStore((s) => s.user);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';
  const mutedIcon = isDark ? '#94a3b8' : '#4b5563';

  const rooms = useChatStore((s) => s.rooms);
  const summary = summarizeCall(call, currentUser?.id, rooms);
  const { isOutgoing, isGroup } = summary;
  const other = summary.avatarUser;
  const missed = call.status === 'missed';
  const { day, time } = formatDateTime(call.createdAt);

  const statusLabel =
    call.status === 'completed'
      ? 'Terminé'
      : call.status === 'rejected'
      ? 'Refusé'
      : isOutgoing
      ? 'Pas de réponse'
      : 'Manqué';

  const startCall = async (type: 'audio' | 'video') => {
    if (!summary.target) return;
    if (!isCallSupported()) {
      Alert.alert(
        'Appels indisponibles',
        "Cette version de l'application ne prend pas en charge les appels.",
      );
      return;
    }
    try {
      await callManager.startCall(summary.target, type);
    } catch (e: any) {
      Alert.alert(
        "Impossible d'appeler",
        e?.message || 'Veuillez réessayer.',
      );
    }
  };

  const InfoRow = ({
    icon,
    label,
    value,
    valueClass,
  }: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    value: string;
    valueClass?: string;
  }) => (
    <View className="flex-row items-center py-3">
      <View className="w-10 h-10 rounded-full bg-surface-chip dark:bg-dark-200 items-center justify-center mr-3">
        <Ionicons name={icon} size={18} color={mutedIcon} />
      </View>
      <View className="flex-1">
        <Text className="text-ink-400 dark:text-slate-400 text-xs font-semibold tracking-wider">
          {label}
        </Text>
        <Text
          className={`text-base font-semibold mt-0.5 ${
            valueClass || 'text-ink-900 dark:text-white'
          }`}
        >
          {value}
        </Text>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      {/* Header */}
      <View className="bg-surface-header dark:bg-dark-300 pb-3 px-4 flex-row items-center" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity
          onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Main'))}
          className="mr-2"
        >
          <Ionicons name="chevron-back" size={26} color={headerAccent} />
        </TouchableOpacity>
        <Text className="text-ink-900 dark:text-white font-bold text-lg">
          Détail de l'appel
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Person */}
        <View className="items-center mt-6 mb-4">
          <View className="w-24 h-24 rounded-full border-[3px] border-primary-500 items-center justify-center bg-primary-100 dark:bg-primary-900 overflow-hidden">
            {isGroup ? (
              <Ionicons name="people" size={40} color={headerAccent} />
            ) : other?.avatar ? (
              <Image
                source={{ uri: other.avatar }}
                className="w-24 h-24"
                cachePolicy="memory-disk"
                transition={120}
              />
            ) : (
              <Text className="text-primary-700 dark:text-primary-300 text-3xl font-bold">
                {(other?.name || '?').charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <Text className="text-ink-900 dark:text-white text-2xl font-bold mt-3 text-center px-6">
            {summary.title}
          </Text>
          <View className="flex-row items-center mt-1">
            <Ionicons
              name={isOutgoing ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={missed ? '#ef4444' : headerAccent}
            />
            <Text
              className={`text-sm ml-1 ${
                missed
                  ? 'text-red-500'
                  : 'text-ink-500 dark:text-slate-300'
              }`}
            >
              Appel {isGroup ? 'de groupe ' : ''}
              {isOutgoing ? 'sortant' : 'entrant'} ·{' '}
              {call.type === 'video' ? 'vidéo' : 'audio'}
            </Text>
          </View>
        </View>

        {/* Quick call-back buttons */}
        <View className="flex-row justify-center mb-4">
          <TouchableOpacity
            onPress={() => startCall('audio')}
            activeOpacity={0.85}
            className="flex-row items-center bg-primary-100 dark:bg-primary-900 rounded-full px-5 py-2.5 mr-3"
          >
            <Ionicons name="call" size={18} color={headerAccent} />
            <Text className="text-primary-700 dark:text-primary-200 font-semibold ml-2">
              Audio
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => startCall('video')}
            activeOpacity={0.85}
            className="flex-row items-center bg-primary-100 dark:bg-primary-900 rounded-full px-5 py-2.5"
          >
            <Ionicons name="videocam" size={18} color={headerAccent} />
            <Text className="text-primary-700 dark:text-primary-200 font-semibold ml-2">
              Vidéo
            </Text>
          </TouchableOpacity>
        </View>

        {/* Call info */}
        <View className="mx-4 bg-surface-card dark:bg-dark-100 rounded-2xl px-4 py-1">
          <InfoRow
            icon="time-outline"
            label="HEURE"
            value={time}
          />
          <View className="h-px bg-ink-200/40 dark:bg-slate-700/50" />
          <InfoRow icon="calendar-outline" label="DATE" value={day} />
          <View className="h-px bg-ink-200/40 dark:bg-slate-700/50" />
          <InfoRow
            icon={
              call.type === 'video' ? 'videocam-outline' : 'call-outline'
            }
            label="TYPE"
            value={call.type === 'video' ? 'Appel vidéo' : 'Appel audio'}
          />
          <View className="h-px bg-ink-200/40 dark:bg-slate-700/50" />
          <InfoRow
            icon={missed ? 'close-circle-outline' : 'checkmark-circle-outline'}
            label="STATUT"
            value={statusLabel}
            valueClass={missed ? 'text-red-500' : undefined}
          />
          {call.status === 'completed' && (
            <>
              <View className="h-px bg-ink-200/40 dark:bg-slate-700/50" />
              <InfoRow
                icon="hourglass-outline"
                label="DURÉE"
                value={formatDuration(call.duration)}
              />
            </>
          )}
        </View>

        {isGroup && (call.participants?.length ?? 0) > 0 && (
          <View className="mx-4 mt-4 bg-surface-card dark:bg-dark-100 rounded-2xl px-4 py-1">
            {call.participants!.map((p, i) => (
              <View key={p.id}>
                {i > 0 && (
                  <View className="h-px bg-ink-200/40 dark:bg-slate-700/50" />
                )}
                <TouchableOpacity
                  onPress={() =>
                    p.userId !== currentUser?.id &&
                    nav.navigate('UserProfile', { userId: p.userId })
                  }
                  activeOpacity={0.7}
                  className="flex-row items-center py-3"
                >
                  <View className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden mr-3">
                    {p.user?.avatar ? (
                      <Image
                        source={{ uri: p.user.avatar }}
                        className="w-10 h-10"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <Text className="text-primary-700 dark:text-primary-300 font-bold">
                        {(p.user?.name || '?').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-ink-900 dark:text-white font-medium">
                      {p.userId === currentUser?.id ? 'Vous' : p.user?.name}
                      {p.isInitiator ? ' · a appelé' : ''}
                    </Text>
                    <Text
                      className={`text-xs ${
                        p.status === 'joined'
                          ? 'text-ink-400 dark:text-slate-400'
                          : 'text-red-500'
                      }`}
                    >
                      {p.status === 'joined'
                        ? p.duration
                          ? formatDuration(p.duration)
                          : 'A participé'
                        : p.status === 'declined'
                          ? 'A refusé'
                          : 'Sans réponse'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* View full profile */}
        {!isGroup && other && (
          <TouchableOpacity
            onPress={() => nav.navigate('UserProfile', { userId: other.id })}
            activeOpacity={0.7}
            className="mx-4 mt-4 bg-surface-card dark:bg-dark-100 rounded-2xl px-4 py-4 flex-row items-center"
          >
            <Ionicons name="person-outline" size={20} color={mutedIcon} />
            <Text className="text-ink-900 dark:text-white text-base font-medium flex-1 ml-3">
              Voir le profil
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}
