import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  useAudioRecorder,
  createAudioPlayer,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSocket } from '../../hooks/useSocket';
import { uploadToCloudinary } from '../../services/upload';
import { callManager, isCallSupported } from '../../services/callManager';
import { Message, RootStackParamList } from '../../types';

type ChatRoomRoute = RouteProp<RootStackParamList, 'ChatRoom'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const EMPTY_MESSAGES: Message[] = [];
const TYPING_DEBOUNCE_MS = 2000;

const formatTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatFileSize = (bytes?: number) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDuration = (seconds?: number) => {
  if (!seconds && seconds !== 0) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
};

const guessMimeType = (uri: string, fallback: string) => {
  const ext = uri.split('.').pop()?.toLowerCase();
  if (!ext) return fallback;
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'm4a') return 'audio/m4a';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  return fallback;
};

type MessageRowProps = {
  message: Message;
  isMe: boolean;
  showAvatar: boolean;
  isGroup: boolean;
  isDark: boolean;
  isPlaying: boolean;
  onLongPress: (msg: Message) => void;
  onImagePress: (url: string) => void;
  onOpenDocument: (msg: Message) => void;
  onTogglePlay: (msg: Message) => void;
};

const MessageRow = React.memo(function MessageRow({
  message: item,
  isMe,
  showAvatar,
  isGroup,
  isDark,
  isPlaying,
  onLongPress,
  onImagePress,
  onOpenDocument,
  onTogglePlay,
}: MessageRowProps) {
  const avatarUrl = item.sender?.avatar;

  return (
    <View
      className={`px-4 mb-3 flex-row ${
        isMe ? 'justify-end' : 'justify-start'
      }`}
    >
      {!isMe && (
        <View className="w-8 h-8 mr-2 rounded-full bg-primary-100 dark:bg-primary-900 items-end justify-end overflow-hidden self-end">
          {showAvatar ? (
            avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                className="w-8 h-8 rounded-full"
                cachePolicy="memory-disk"
                transition={120}
              />
            ) : (
              <View className="w-8 h-8 rounded-full bg-primary-200 dark:bg-primary-800 items-center justify-center">
                <Text className="text-primary-700 dark:text-primary-200 font-bold text-xs">
                  {(item.sender?.name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )
          ) : null}
        </View>
      )}
      <Pressable
        onLongPress={() => onLongPress(item)}
        className={`max-w-[78%] rounded-2xl ${
          item.type === 'image' && !item.deletedForEveryone
            ? 'overflow-hidden p-1'
            : 'px-4 py-2.5'
        } ${
          isMe
            ? 'bg-primary-700 rounded-br-md'
            : 'bg-surface-bubbleIn dark:bg-dark-100 rounded-bl-md'
        }`}
      >
        {!isMe &&
          isGroup &&
          showAvatar &&
          (item.type !== 'image' || item.deletedForEveryone) && (
            <Text className="text-primary-700 dark:text-primary-300 text-xs font-bold mb-0.5">
              {item.sender?.name || 'Unknown'}
            </Text>
          )}

        {item.deletedForEveryone ? (
          <View className="flex-row items-center">
            <Ionicons
              name="ban-outline"
              size={15}
              color={isMe ? '#ffffffaa' : isDark ? '#94a3b8' : '#9ca3af'}
            />
            <Text
              className={`text-base italic ml-1.5 ${
                isMe ? 'text-white/70' : 'text-ink-400 dark:text-slate-400'
              }`}
            >
              This message was deleted
            </Text>
          </View>
        ) : item.type === 'image' && item.fileUrl ? (
          <Pressable
            onPress={() => onImagePress(item.fileUrl!)}
            onLongPress={() => onLongPress(item)}
          >
            <Image
              source={{ uri: item.fileUrl }}
              style={{ width: 220, height: 220, borderRadius: 14 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={120}
            />
          </Pressable>
        ) : item.type === 'file' && item.fileUrl ? (
          <TouchableOpacity
            onPress={() => onOpenDocument(item)}
            onLongPress={() => onLongPress(item)}
            activeOpacity={0.7}
            className="flex-row items-center"
          >
            <View
              className={`w-10 h-10 rounded-xl items-center justify-center mr-2 ${
                isMe ? 'bg-white/20' : 'bg-primary-100 dark:bg-primary-900'
              }`}
            >
              <Ionicons
                name="document-text"
                size={22}
                color={isMe ? '#ffffff' : isDark ? '#86efac' : '#15803d'}
              />
            </View>
            <View className="flex-shrink">
              <Text
                numberOfLines={1}
                className={`font-semibold text-sm ${
                  isMe ? 'text-white' : 'text-ink-900 dark:text-white'
                }`}
              >
                {item.fileName || 'Document'}
              </Text>
              <Text
                className={`text-[11px] ${
                  isMe ? 'text-white/80' : 'text-ink-400 dark:text-slate-400'
                }`}
              >
                {formatFileSize(item.fileSize)}
              </Text>
            </View>
          </TouchableOpacity>
        ) : item.type === 'voice' && item.fileUrl ? (
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => onTogglePlay(item)}
              onLongPress={() => onLongPress(item)}
              activeOpacity={0.7}
              className={`w-9 h-9 rounded-full items-center justify-center mr-2 ${
                isMe ? 'bg-white/20' : 'bg-primary-100 dark:bg-primary-900'
              }`}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={18}
                color={isMe ? '#ffffff' : isDark ? '#86efac' : '#15803d'}
              />
            </TouchableOpacity>
            <View className="flex-row items-end mr-2" style={{ height: 18 }}>
              {[6, 12, 8, 14, 10, 12, 7].map((h, i) => (
                <View
                  key={i}
                  style={{ height: h, width: 2, marginHorizontal: 1 }}
                  className={`rounded-full ${
                    isMe ? 'bg-white/70' : 'bg-primary-500'
                  }`}
                />
              ))}
            </View>
            <Text
              className={`text-xs ${
                isMe ? 'text-white/90' : 'text-ink-500 dark:text-slate-300'
              }`}
            >
              {formatDuration(item.duration)}
            </Text>
          </View>
        ) : (
          <Text
            className={`text-base ${
              isMe ? 'text-white' : 'text-ink-900 dark:text-white'
            }`}
          >
            {item.content}
          </Text>
        )}

        <View
          className={`flex-row items-center justify-end ${
            item.type === 'image' ? 'mt-1 px-2 pb-1' : 'mt-1'
          }`}
        >
          <Text
            className={`text-[10px] ${
              isMe ? 'text-white/80' : 'text-ink-400 dark:text-slate-400'
            }`}
          >
            {formatTime(item.createdAt)}
          </Text>
          {isMe && !item.deletedForEveryone && (
            <Text
              className={`text-[10px] ml-1 ${
                item.status === 'read' ? 'text-white' : 'text-white/70'
              }`}
            >
              {item.status === 'sent' ? '✓' : '✓✓'}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
});

export default function ChatRoomScreen() {
  const route = useRoute<ChatRoomRoute>();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { roomId, roomName } = route.params;
  const [text, setText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const messages = useChatStore((s) => s.messages[roomId] ?? EMPTY_MESSAGES);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const setActiveRoom = useChatStore((s) => s.setActiveRoom);
  const room = useChatStore((s) => s.rooms.find((r) => r.id === roomId));
  const typingMap = useChatStore((s) => s.typingByRoom[roomId]);
  const deleteMessageForMe = useChatStore((s) => s.deleteMessageForMe);
  const deleteMessageForEveryone = useChatStore(
    (s) => s.deleteMessageForEveryone,
  );
  const currentUser = useAuthStore((s) => s.user);
  const { joinRoom, leaveRoom, sendMessage, sendTyping, markAsRead } = useSocket();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [attachOpen, setAttachOpen] = useState(false);
  const [uploadingType, setUploadingType] = useState<null | 'image' | 'file' | 'voice'>(
    null,
  );
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'preview'>(
    'idle',
  );
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackRef = useRef<AudioPlayer | null>(null);
  const previewPlayerRef = useRef<AudioPlayer | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playingIdRef = useRef<string | null>(null);
  const setPlaying = useCallback((id: string | null) => {
    playingIdRef.current = id;
    setPlayingId(id);
  }, []);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const headerAccent = isDark ? '#86efac' : '#15803d';
  const mutedIcon = isDark ? '#94a3b8' : '#4b5563';

  const isGroup = room?.type === 'group';

  const otherMember = useMemo(() => {
    if (!room || room.type !== 'direct') return null;
    return room.members?.find((m) => m.id !== currentUser?.id) || null;
  }, [room, currentUser?.id]);

  const typingNames = useMemo(() => {
    if (!typingMap || !room) return [] as string[];
    const ids = Object.keys(typingMap).filter((id) => id !== currentUser?.id);
    return ids
      .map((id) => room.members?.find((m) => m.id === id)?.name)
      .filter((n): n is string => Boolean(n));
  }, [typingMap, room, currentUser?.id]);

  const typingLabel =
    typingNames.length === 0
      ? null
      : typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : `${typingNames.join(', ')} are typing…`;

  const stopTyping = (currentRoomId: string) => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTyping(currentRoomId, false);
    }
  };

  useEffect(() => {
    setActiveRoom(roomId);
    joinRoom(roomId);
    fetchMessages(roomId);
    markAsRead(roomId);

    return () => {
      stopTyping(roomId);
      setActiveRoom(null);
      leaveRoom(roomId);
    };
  }, [roomId]);

  const handleChangeText = (next: string) => {
    setText(next);
    if (next.length === 0) {
      stopTyping(roomId);
      return;
    }
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(roomId, true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      typingTimeoutRef.current = null;
      sendTyping(roomId, false);
    }, TYPING_DEBOUNCE_MS);
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    stopTyping(roomId);
    sendMessage(roomId, trimmed);
    setText('');
  };

  const handlePickImage = async (fromCamera: boolean) => {
    setAttachOpen(false);
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Allow access to continue.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.85, mediaTypes: ['images'] })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.85,
        });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingType('image');
    try {
      const uploaded = await uploadToCloudinary({
        uri: asset.uri,
        name: asset.fileName || `image-${Date.now()}.jpg`,
        mimeType: asset.mimeType || guessMimeType(asset.uri, 'image/jpeg'),
        folder: 'messages/images',
        resourceType: 'image',
      });
      sendMessage(roomId, '', {
        type: 'image',
        fileUrl: uploaded.url,
        fileSize: uploaded.bytes,
      });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    } finally {
      setUploadingType(null);
    }
  };

  const handlePickDocument = async () => {
    setAttachOpen(false);
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingType('file');
    try {
      const uploaded = await uploadToCloudinary({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || guessMimeType(asset.uri, 'application/octet-stream'),
        folder: 'messages/files',
        resourceType: 'raw',
      });
      sendMessage(roomId, '', {
        type: 'file',
        fileUrl: uploaded.url,
        fileName: asset.name,
        fileSize: asset.size ?? uploaded.bytes,
      });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    } finally {
      setUploadingType(null);
    }
  };

  const cleanupPreviewPlayer = () => {
    if (previewPlayerRef.current) {
      try {
        previewPlayerRef.current.remove();
      } catch {}
      previewPlayerRef.current = null;
    }
    setPreviewPlaying(false);
  };

  const startRecording = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone permission required');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoiceState('recording');
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(
        () => setRecordSeconds((s) => s + 1),
        1000,
      );
    } catch (e: any) {
      Alert.alert('Recording failed', e?.message || 'Please try again.');
    }
  };

  const stopRecording = async () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const elapsed = recordSeconds;
    try {
      const durationSec = recorder.currentTime || elapsed;
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri || durationSec < 0.6) {
        setVoiceState('idle');
        setRecordSeconds(0);
        return;
      }
      setPreviewUri(uri);
      setPreviewDuration(durationSec);
      setVoiceState('preview');
    } catch (e: any) {
      Alert.alert('Recording failed', e?.message || 'Please try again.');
      setVoiceState('idle');
    } finally {
      setRecordSeconds(0);
    }
  };

  const cancelRecording = async () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (voiceState === 'recording') {
      try {
        await recorder.stop();
      } catch {}
    }
    cleanupPreviewPlayer();
    setPreviewUri(null);
    setPreviewDuration(0);
    setRecordSeconds(0);
    setVoiceState('idle');
  };

  const togglePreviewPlayback = () => {
    if (!previewUri) return;
    if (previewPlayerRef.current) {
      if (previewPlaying) {
        previewPlayerRef.current.pause();
        setPreviewPlaying(false);
      } else {
        previewPlayerRef.current.play();
        setPreviewPlaying(true);
      }
      return;
    }
    try {
      const player = createAudioPlayer(
        { uri: previewUri },
        { updateInterval: 200 },
      );
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          setPreviewPlaying(false);
        }
      });
      previewPlayerRef.current = player;
      player.play();
      setPreviewPlaying(true);
    } catch (e: any) {
      Alert.alert('Playback failed', e?.message || 'Please try again.');
    }
  };

  const sendVoicePreview = async () => {
    if (!previewUri) return;
    const uri = previewUri;
    const duration = previewDuration;
    cleanupPreviewPlayer();
    setPreviewUri(null);
    setPreviewDuration(0);
    setVoiceState('idle');
    setUploadingType('voice');
    try {
      const uploaded = await uploadToCloudinary({
        uri,
        name: `voice-${Date.now()}.m4a`,
        mimeType: 'audio/m4a',
        folder: 'messages/voice',
        resourceType: 'video',
      });
      sendMessage(roomId, '', {
        type: 'voice',
        fileUrl: uploaded.url,
        duration,
        fileSize: uploaded.bytes,
      });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    } finally {
      setUploadingType(null);
    }
  };

  const togglePlay = useCallback((msg: Message) => {
    if (!msg.fileUrl) return;
    try {
      if (playingIdRef.current === msg.id && playbackRef.current) {
        playbackRef.current.pause();
        playbackRef.current.remove();
        playbackRef.current = null;
        setPlaying(null);
        return;
      }
      if (playbackRef.current) {
        playbackRef.current.remove();
        playbackRef.current = null;
      }
      const player = createAudioPlayer({ uri: msg.fileUrl }, { updateInterval: 200 });
      playbackRef.current = player;
      setPlaying(msg.id);
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          player.remove();
          if (playbackRef.current === player) playbackRef.current = null;
          setPlaying(null);
        }
      });
      player.play();
    } catch (e: any) {
      Alert.alert('Playback failed', e?.message || 'Please try again.');
    }
  }, [setPlaying]);

  const openDocument = useCallback((msg: Message) => {
    if (!msg.fileUrl) return;
    Linking.openURL(msg.fileUrl).catch(() => {
      Alert.alert('Cannot open this file');
    });
  }, []);

  const handleMessageLongPress = useCallback((msg: Message) => {
    if (msg.deletedForEveryone) return;
    const isMine = msg.senderId === currentUser?.id;
    const buttons: any[] = [];
    if (isMine) {
      buttons.push({
        text: 'Delete for everyone',
        style: 'destructive',
        onPress: () =>
          deleteMessageForEveryone(roomId, msg.id).catch((e: any) =>
            Alert.alert('Failed', e?.message || 'Please try again.'),
          ),
      });
    }
    buttons.push({
      text: 'Delete for me',
      style: 'destructive',
      onPress: () =>
        deleteMessageForMe(roomId, msg.id).catch((e: any) =>
          Alert.alert('Failed', e?.message || 'Please try again.'),
        ),
    });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Delete message', undefined, buttons);
  }, [currentUser?.id, roomId, deleteMessageForEveryone, deleteMessageForMe]);

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!otherMember) return;
    if (!isCallSupported()) {
      Alert.alert(
        'Calls unavailable',
        'Please update to the latest app build to make calls.',
      );
      return;
    }
    try {
      await callManager.startCall(
        {
          id: otherMember.id,
          name: otherMember.name,
          avatar: otherMember.avatar,
        },
        type,
      );
    } catch (e: any) {
      Alert.alert('Call failed', e?.message || 'Please try again.');
    }
  };

  useEffect(() => {
    return () => {
      if (playbackRef.current) {
        playbackRef.current.remove();
        playbackRef.current = null;
      }
      if (previewPlayerRef.current) {
        previewPlayerRef.current.remove();
        previewPlayerRef.current = null;
      }
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isMe = item.senderId === currentUser?.id;
      const prev = messages[index - 1];
      const showAvatar = !isMe && (!prev || prev.senderId !== item.senderId);
      return (
        <MessageRow
          message={item}
          isMe={isMe}
          showAvatar={showAvatar}
          isGroup={isGroup}
          isDark={isDark}
          isPlaying={playingId === item.id}
          onLongPress={handleMessageLongPress}
          onImagePress={setFullscreenUrl}
          onOpenDocument={openDocument}
          onTogglePlay={togglePlay}
        />
      );
    },
    [
      currentUser?.id,
      messages,
      isGroup,
      isDark,
      playingId,
      handleMessageLongPress,
      openDocument,
      togglePlay,
    ],
  );

  const presenceLabel = otherMember
    ? otherMember.isOnline
      ? 'Online'
      : 'Offline'
    : null;

  const groupSubtitle = isGroup && room
    ? `${room.members.length} member${room.members.length > 1 ? 's' : ''}`
    : null;

  const openSettings = () => {
    if (isGroup) {
      nav.navigate('GroupSettings', { roomId });
    } else if (otherMember) {
      nav.navigate('UserProfile', { userId: otherMember.id });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-surface-page dark:bg-dark-200"
    >
      {/* Header */}
      <View className="bg-surface-header dark:bg-dark-300 pb-3 px-4 flex-row items-center" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity
          onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Main'))}
          className="mr-2"
        >
          <Ionicons name="chevron-back" size={26} color={headerAccent} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={openSettings}
          disabled={!isGroup && !otherMember}
          activeOpacity={0.7}
          className="flex-row items-center flex-1"
        >
          <View className="relative mr-3">
            <View className="w-10 h-10 rounded-full border-2 border-primary-500 items-center justify-center overflow-hidden bg-primary-100 dark:bg-primary-900">
              {(isGroup ? room?.avatar : otherMember?.avatar) ? (
                <Image
                  source={{
                    uri: (isGroup ? room?.avatar : otherMember?.avatar) as string,
                  }}
                  className="w-10 h-10 rounded-full"
                  cachePolicy="memory-disk"
                  transition={120}
                />
              ) : (
                <Text className="text-primary-700 dark:text-primary-200 font-bold">
                  {(roomName || '?').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            {!isGroup && otherMember?.isOnline && (
              <View className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-primary-500 border-2 border-surface-header dark:border-dark-300" />
            )}
          </View>

          <View className="flex-1">
            <Text
              className="text-ink-900 dark:text-white font-bold text-base"
              numberOfLines={1}
            >
              {roomName}
            </Text>
            {typingLabel ? (
              <Text className="text-primary-600 dark:text-primary-300 text-xs italic">
                {typingLabel}
              </Text>
            ) : groupSubtitle ? (
              <Text className="text-ink-400 dark:text-slate-400 text-xs">
                {groupSubtitle}
              </Text>
            ) : presenceLabel ? (
              <Text
                className={`text-xs ${
                  otherMember?.isOnline
                    ? 'text-primary-600 dark:text-primary-300'
                    : 'text-ink-400 dark:text-slate-400'
                }`}
              >
                {presenceLabel}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>

        {!isGroup && (
          <>
            <TouchableOpacity
              className="ml-3"
              onPress={() => handleStartCall('audio')}
            >
              <Ionicons name="call-outline" size={22} color={headerAccent} />
            </TouchableOpacity>
            <TouchableOpacity
              className="ml-4"
              onPress={() => handleStartCall('video')}
            >
              <Ionicons
                name="videocam-outline"
                size={22}
                color={headerAccent}
              />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Date pill */}
      <View className="items-center my-3">
        <View className="bg-surface-chip dark:bg-dark-100 rounded-full px-3 py-1">
          <Text className="text-ink-500 dark:text-slate-300 text-xs font-semibold tracking-wider">
            TODAY
          </Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 4, paddingBottom: 12 }}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={11}
        removeClippedSubviews={true}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      />

      {/* Typing indicator */}
      {typingLabel && (
        <View className="px-5 pb-2 flex-row items-center">
          <View className="flex-row mr-2">
            <View className="w-1.5 h-1.5 rounded-full bg-primary-500 mr-0.5" />
            <View className="w-1.5 h-1.5 rounded-full bg-primary-500 mr-0.5" />
            <View className="w-1.5 h-1.5 rounded-full bg-primary-500" />
          </View>
          <Text className="text-primary-600 dark:text-primary-300 text-sm italic">
            {typingLabel}
          </Text>
        </View>
      )}

      {/* Uploading indicator */}
      {uploadingType && (
        <View className="flex-row items-center justify-center px-4 py-2 bg-primary-50 dark:bg-primary-900/30">
          <ActivityIndicator size="small" color="#16a34a" />
          <Text className="text-primary-700 dark:text-primary-200 text-xs ml-2">
            Uploading {uploadingType}…
          </Text>
        </View>
      )}

      {/* Voice bar: recording or preview state replaces the input */}
      {voiceState === 'recording' ? (
        <View className="flex-row items-center px-4 py-3 bg-surface-card dark:bg-dark-300 border-t border-ink-200/50 dark:border-slate-700/50">
          <TouchableOpacity
            onPress={cancelRecording}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/40 items-center justify-center mr-3"
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
          <View className="flex-1 flex-row items-center bg-red-50 dark:bg-red-900/30 rounded-2xl px-4 py-2.5">
            <View className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2" />
            <Text className="text-red-600 dark:text-red-300 text-sm font-semibold flex-1">
              Recording…
            </Text>
            <Text className="text-red-600 dark:text-red-300 text-sm font-mono">
              {formatDuration(recordSeconds)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={stopRecording}
            activeOpacity={0.85}
            className="w-10 h-10 rounded-full bg-primary-600 items-center justify-center ml-3"
          >
            <Ionicons name="stop" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      ) : voiceState === 'preview' ? (
        <View className="flex-row items-center px-4 py-3 bg-surface-card dark:bg-dark-300 border-t border-ink-200/50 dark:border-slate-700/50">
          <TouchableOpacity
            onPress={cancelRecording}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/40 items-center justify-center mr-3"
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
          <View className="flex-1 flex-row items-center bg-primary-50 dark:bg-primary-900/30 rounded-2xl px-3 py-2">
            <TouchableOpacity
              onPress={togglePreviewPlayback}
              activeOpacity={0.7}
              className="w-9 h-9 rounded-full bg-primary-600 items-center justify-center mr-3"
            >
              <Ionicons
                name={previewPlaying ? 'pause' : 'play'}
                size={16}
                color="#ffffff"
              />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-ink-900 dark:text-white text-sm font-semibold">
                Voice message
              </Text>
              <Text className="text-ink-400 dark:text-slate-400 text-xs">
                {formatDuration(previewDuration)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={sendVoicePreview}
            activeOpacity={0.85}
            className="w-10 h-10 rounded-full bg-primary-600 items-center justify-center ml-3"
          >
            <Ionicons name="send" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View className="flex-row items-center px-4 py-3 bg-surface-card dark:bg-dark-300 border-t border-ink-200/50 dark:border-slate-700/50">
          <TouchableOpacity
            onPress={() => setAttachOpen(true)}
            className="w-9 h-9 rounded-full bg-surface-chip dark:bg-dark-100 items-center justify-center mr-2"
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color={mutedIcon} />
          </TouchableOpacity>
          <TextInput
            className="flex-1 bg-surface-chip dark:bg-dark-100 text-ink-900 dark:text-white rounded-2xl px-4 py-2.5 text-base mr-2"
            placeholder="Message..."
            placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
            value={text}
            onChangeText={handleChangeText}
            multiline
            maxLength={2000}
          />
          {text.trim().length > 0 ? (
            <TouchableOpacity
              className="w-10 h-10 rounded-full bg-primary-600 items-center justify-center"
              activeOpacity={0.85}
              onPress={handleSend}
            >
              <Ionicons name="send" size={18} color="#ffffff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={startRecording}
              activeOpacity={0.85}
              className="w-10 h-10 rounded-full bg-primary-600 items-center justify-center"
            >
              <Ionicons name="mic" size={18} color="#ffffff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Attach action sheet */}
      <Modal
        visible={attachOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={() => setAttachOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-surface-card dark:bg-dark-300 rounded-t-3xl px-6 pt-5 pb-10"
          >
            <View className="items-center mb-4">
              <View className="w-10 h-1 rounded-full bg-ink-200 dark:bg-slate-600" />
            </View>
            <Text className="text-ink-900 dark:text-white font-bold text-base mb-4">
              Send a media
            </Text>
            <View className="flex-row flex-wrap">
              {[
                {
                  key: 'camera',
                  icon: 'camera' as const,
                  label: 'Camera',
                  onPress: () => handlePickImage(true),
                },
                {
                  key: 'gallery',
                  icon: 'image' as const,
                  label: 'Gallery',
                  onPress: () => handlePickImage(false),
                },
                {
                  key: 'doc',
                  icon: 'document-text' as const,
                  label: 'Document',
                  onPress: handlePickDocument,
                },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={opt.onPress}
                  activeOpacity={0.7}
                  className="items-center mr-6 mb-2"
                  style={{ width: 72 }}
                >
                  <View className="w-14 h-14 rounded-2xl bg-primary-100 dark:bg-primary-900 items-center justify-center mb-2">
                    <Ionicons name={opt.icon} size={24} color={headerAccent} />
                  </View>
                  <Text className="text-ink-700 dark:text-slate-200 text-xs font-semibold">
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fullscreen image */}
      <Modal
        visible={!!fullscreenUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenUrl(null)}
      >
        <Pressable
          className="flex-1 bg-black/95 items-center justify-center"
          onPress={() => setFullscreenUrl(null)}
        >
          {fullscreenUrl && (
            <Image
              source={{ uri: fullscreenUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={120}
            />
          )}
          <TouchableOpacity
            onPress={() => setFullscreenUrl(null)}
            className="absolute top-12 right-6 w-10 h-10 rounded-full bg-black/50 items-center justify-center"
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
