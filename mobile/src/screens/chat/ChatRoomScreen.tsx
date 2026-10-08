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
  PanResponder,
  AppState,
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
import { useCallStore } from '../../store/useCallStore';
import { useSocket } from '../../hooks/useSocket';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { uploadToCloudinary } from '../../services/upload';
import { callManager, isCallSupported } from '../../services/callManager';
import { dismissRoomNotifications } from '../../services/notifications';
import { getSocket } from '../../services/socket';
import MessageTicks from '../../components/MessageTicks';
import { Message, RootStackParamList } from '../../types';

type ChatRoomRoute = RouteProp<RootStackParamList, 'ChatRoom'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const EMPTY_MESSAGES: Message[] = [];
const TYPING_DEBOUNCE_MS = 2000;
/**
 * Le destinataire efface l'indicateur au bout de 5 s sans nouvelle : on le
 * renouvelle avant, tant qu'on écrit ou qu'on enregistre.
 */
const TYPING_REFRESH_MS = 3000;
/** Glissement vers la gauche qui annule un vocal en cours, comme WhatsApp. */
const VOICE_CANCEL_DX = 110;
/** Glissement vers le haut qui verrouille l'enregistrement (mains libres). */
const VOICE_LOCK_DY = 80;
/** En dessous, c'est un simple appui : on explique le geste au lieu d'envoyer. */
const VOICE_MIN_SECONDS = 1;

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
              {item.sender?.name || 'Inconnu'}
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
              {isMe ? 'Vous avez supprimé ce message' : 'Ce message a été supprimé'}
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
            <View className="ml-1">
              <MessageTicks status={item.status} color="#ffffffb3" size={15} />
            </View>
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
  const lastTypingEmitRef = useRef(0);

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
  const keyboardVisible = useKeyboardVisible();
  // Place sous la barre de saisie pour la barre de navigation du téléphone.
  const bottomGap = keyboardVisible ? 0 : insets.bottom;

  const [attachOpen, setAttachOpen] = useState(false);
  const [uploadingType, setUploadingType] = useState<null | 'image' | 'file' | 'voice'>(
    null,
  );
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  // holding = doigt posé sur le micro ; recording = enregistrement verrouillé
  // (glissé vers le haut) ; preview = écoute avant envoi.
  const [voiceState, setVoiceState] = useState<
    'idle' | 'holding' | 'recording' | 'preview'
  >('idle');
  const voiceStateRef = useRef<typeof voiceState>('idle');
  const setVoice = useCallback((next: typeof voiceState) => {
    voiceStateRef.current = next;
    setVoiceState(next);
  }, []);
  const [dragX, setDragX] = useState(0);
  const [voiceHint, setVoiceHint] = useState(false);
  const voiceHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartRef = useRef<Promise<boolean> | null>(null);
  const recordStartedAtRef = useRef(0);
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
  // Appel de groupe en cours dans ce salon : on propose de le rejoindre
  // plutot que d'en lancer un second.
  const roomCall = useCallStore((s) => s.roomCalls[roomId]);
  const callStatus = useCallStore((s) => s.status);
  const inThisCall = useCallStore(
    (s) => !!roomCall && s.callId === roomCall.callId,
  );

  useEffect(() => {
    if (isGroup) void callManager.refreshRoomCall(roomId);
  }, [isGroup, roomId]);

  const otherMember = useMemo(() => {
    if (!room || room.type !== 'direct') return null;
    return room.members?.find((m) => m.id !== currentUser?.id) || null;
  }, [room, currentUser?.id]);

  // « écrit… » / « enregistre un audio… », comme sur WhatsApp. En direct le
  // nom est déjà dans l'en-tête ; dans un groupe on précise qui.
  const typingLabel = useMemo(() => {
    if (!typingMap || !room) return null;
    const active = Object.entries(typingMap).filter(
      ([id]) => id !== currentUser?.id,
    );
    if (active.length === 0) return null;
    const recording = active.some(([, kind]) => kind === 'recording');
    if (room.type !== 'group') {
      return recording ? 'enregistre un audio…' : 'écrit…';
    }
    const names = active
      .map(([id]) => room.members?.find((m) => m.id === id)?.name?.split(' ')[0])
      .filter((n): n is string => Boolean(n));
    if (names.length === 0) return null;
    if (names.length === 1) {
      return `${names[0]} ${recording ? 'enregistre un audio…' : 'écrit…'}`;
    }
    return `${names.join(', ')} ${recording ? 'enregistrent…' : 'écrivent…'}`;
  }, [typingMap, room, currentUser?.id]);

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
    void dismissRoomNotifications(roomId);

    // Telephone verrouille ou application en arriere-plan, conversation
    // toujours ouverte : on n'est plus « dans » le salon. Le serveur envoie
    // alors les notifications et les coches ne passent plus au bleu, comme
    // WhatsApp. Au retour, on y entre a nouveau (et on lit).
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setActiveRoom(roomId);
        joinRoom(roomId);
        void dismissRoomNotifications(roomId);
      } else if (state === 'background') {
        stopTyping(roomId);
        setActiveRoom(null);
        leaveRoom(roomId);
      }
    });

    // Une reconnexion du socket fait perdre les salons rejoints.
    const socket = getSocket();
    const onReconnect = () => {
      if (AppState.currentState === 'active') joinRoom(roomId);
    };
    socket?.on('connect', onReconnect);

    return () => {
      appStateSub.remove();
      socket?.off('connect', onReconnect);
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
    const now = Date.now();
    if (!isTypingRef.current || now - lastTypingEmitRef.current > TYPING_REFRESH_MS) {
      isTypingRef.current = true;
      lastTypingEmitRef.current = now;
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

  const stopRecordTimers = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    sendTyping(roomId, false, 'recording');
  };

  /** Démarre l'enregistrement ; faux si le micro est refusé ou indisponible. */
  const beginRecording = async (): Promise<boolean> => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Micro requis',
          "Autorisez l'accès au micro pour envoyer des messages vocaux.",
        );
        return false;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStartedAtRef.current = Date.now();
      setRecordSeconds(0);
      stopTyping(roomId);
      sendTyping(roomId, true, 'recording');
      let ticks = 0;
      recordTimerRef.current = setInterval(() => {
        ticks += 1;
        setRecordSeconds((sec) => sec + 1);
        if (ticks % (TYPING_REFRESH_MS / 1000) === 0) {
          sendTyping(roomId, true, 'recording');
        }
      }, 1000);
      return true;
    } catch (e: any) {
      Alert.alert("Enregistrement impossible", e?.message || 'Veuillez réessayer.');
      return false;
    }
  };

  /** Arrête l'enregistrement et renvoie le fichier, ou null. */
  const endRecording = async (): Promise<{ uri: string; duration: number } | null> => {
    stopRecordTimers();
    const elapsed = (Date.now() - recordStartedAtRef.current) / 1000;
    try {
      const duration = recorder.currentTime || elapsed;
      await recorder.stop();
      const uri = recorder.uri;
      return uri ? { uri, duration } : null;
    } catch {
      return null;
    } finally {
      setRecordSeconds(0);
    }
  };

  const showVoiceHint = () => {
    setVoiceHint(true);
    if (voiceHintTimerRef.current) clearTimeout(voiceHintTimerRef.current);
    voiceHintTimerRef.current = setTimeout(() => setVoiceHint(false), 2500);
  };

  // --- Micro maintenu, comme WhatsApp : relâcher envoie, glisser à gauche
  // annule, glisser vers le haut verrouille.

  const onMicGrant = () => {
    if (voiceStateRef.current !== 'idle') return;
    setDragX(0);
    setVoiceHint(false);
    setVoice('holding');
    recordingStartRef.current = beginRecording().then((ok) => {
      if (!ok && voiceStateRef.current === 'holding') setVoice('idle');
      return ok;
    });
  };

  const cancelHold = async () => {
    setVoice('idle');
    setDragX(0);
    if (await recordingStartRef.current) await endRecording();
    recordingStartRef.current = null;
  };

  const onMicMove = (dx: number, dy: number) => {
    if (voiceStateRef.current !== 'holding') return;
    if (dx < -VOICE_CANCEL_DX) {
      void cancelHold();
      return;
    }
    if (dy < -VOICE_LOCK_DY) {
      // Verrouillé : la barre d'enregistrement prend le relais, avec ses
      // boutons supprimer / arrêter.
      setDragX(0);
      setVoice('recording');
      return;
    }
    setDragX(Math.min(0, dx));
  };

  const onMicRelease = async () => {
    if (voiceStateRef.current !== 'holding') return;
    setVoice('idle');
    setDragX(0);
    const started = await recordingStartRef.current;
    recordingStartRef.current = null;
    if (!started) return;
    const result = await endRecording();
    if (!result || result.duration < VOICE_MIN_SECONDS) {
      showVoiceHint();
      return;
    }
    await uploadAndSendVoice(result.uri, result.duration);
  };

  const onMicTerminate = () => {
    if (voiceStateRef.current === 'holding') void cancelHold();
  };

  const micHandlers = useRef({
    grant: onMicGrant,
    move: onMicMove,
    release: onMicRelease,
    terminate: onMicTerminate,
  });
  micHandlers.current = {
    grant: onMicGrant,
    move: onMicMove,
    release: onMicRelease,
    terminate: onMicTerminate,
  };
  const micResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => micHandlers.current.grant(),
      onPanResponderMove: (_, g) => micHandlers.current.move(g.dx, g.dy),
      onPanResponderRelease: () => {
        void micHandlers.current.release();
      },
      onPanResponderTerminate: () => micHandlers.current.terminate(),
    }),
  ).current;

  /** Enregistrement verrouillé : arrêt puis écoute avant envoi. */
  const stopRecording = async () => {
    const result = await endRecording();
    recordingStartRef.current = null;
    if (!result || result.duration < VOICE_MIN_SECONDS) {
      setVoice('idle');
      return;
    }
    setPreviewUri(result.uri);
    setPreviewDuration(result.duration);
    setVoice('preview');
  };

  const cancelRecording = async () => {
    if (voiceStateRef.current === 'recording') await endRecording();
    recordingStartRef.current = null;
    cleanupPreviewPlayer();
    setPreviewUri(null);
    setPreviewDuration(0);
    setRecordSeconds(0);
    setVoice('idle');
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
    setVoice('idle');
    await uploadAndSendVoice(uri, duration);
  };

  const uploadAndSendVoice = async (uri: string, duration: number) => {
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
      Alert.alert("Échec de l'envoi", e?.message || 'Veuillez réessayer.');
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
        text: 'Supprimer pour tout le monde',
        style: 'destructive',
        onPress: () =>
          deleteMessageForEveryone(roomId, msg.id).catch((e: any) =>
            Alert.alert('Échec', e?.message || 'Veuillez réessayer.'),
          ),
      });
    }
    buttons.push({
      text: 'Supprimer pour moi',
      style: 'destructive',
      onPress: () =>
        deleteMessageForMe(roomId, msg.id).catch((e: any) =>
          Alert.alert('Échec', e?.message || 'Veuillez réessayer.'),
        ),
    });
    buttons.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert('Supprimer le message ?', undefined, buttons);
  }, [currentUser?.id, roomId, deleteMessageForEveryone, deleteMessageForMe]);

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!isGroup && !otherMember) return;
    if (!isCallSupported()) {
      Alert.alert(
        'Appels indisponibles',
        "Cette version de l'application ne prend pas en charge les appels.",
      );
      return;
    }
    try {
      if (isGroup) {
        // Tout le salon est appele ; le serveur nous fait rejoindre l'appel
        // deja en cours s'il y en a un.
        await callManager.startCall(
          { roomId, title: room?.name || 'Groupe' },
          type,
        );
      } else {
        await callManager.startCall(
          {
            peers: [
              {
                id: otherMember!.id,
                name: otherMember!.name,
                avatar: otherMember!.avatar,
              },
            ],
          },
          type,
        );
      }
    } catch (e: any) {
      Alert.alert(
        "Impossible d'appeler",
        e?.message || 'Veuillez réessayer.',
      );
    }
  };

  const handleJoinCall = async () => {
    try {
      await callManager.joinRoomCall(roomId, room?.name || 'Groupe');
    } catch (e: any) {
      Alert.alert(
        "Impossible de rejoindre l'appel",
        e?.message || 'Veuillez réessayer.',
      );
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
      if (voiceHintTimerRef.current) clearTimeout(voiceHintTimerRef.current);
      const v = voiceStateRef.current;
      if (v === 'holding' || v === 'recording') {
        sendTyping(roomId, false, 'recording');
        recorder.stop().catch(() => undefined);
      }
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
      ? 'En ligne'
      : 'Hors ligne'
    : null;

  const groupSubtitle = isGroup && room
    ? `${room.members.length} membre${room.members.length > 1 ? 's' : ''}`
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
      // En edge-to-edge, Android ne redimensionne plus la fenêtre à
      // l'ouverture du clavier : sans « padding », il recouvrait la saisie.
      behavior="padding"
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

        <TouchableOpacity
          className="ml-3"
          onPress={() => handleStartCall('audio')}
          accessibilityLabel={isGroup ? 'Appel de groupe' : 'Appeler'}
        >
          <Ionicons name="call-outline" size={22} color={headerAccent} />
        </TouchableOpacity>
        <TouchableOpacity
          className="ml-4"
          onPress={() => handleStartCall('video')}
          accessibilityLabel={isGroup ? 'Appel vidéo de groupe' : 'Appel vidéo'}
        >
          <Ionicons
            name="videocam-outline"
            size={22}
            color={headerAccent}
          />
        </TouchableOpacity>
      </View>

      {isGroup && roomCall && !inThisCall && callStatus === 'idle' && (
        <TouchableOpacity
          onPress={handleJoinCall}
          activeOpacity={0.85}
          className="flex-row items-center bg-primary-600 px-4 py-2.5"
        >
          <Ionicons
            name={roomCall.callType === 'video' ? 'videocam' : 'call'}
            size={18}
            color="#ffffff"
          />
          <Text className="flex-1 text-white font-semibold ml-2">
            {roomCall.callType === 'video'
              ? 'Appel vidéo en cours'
              : 'Appel en cours'}
          </Text>
          <View className="bg-white rounded-full px-3 py-1">
            <Text className="text-primary-700 font-bold text-sm">Rejoindre</Text>
          </View>
        </TouchableOpacity>
      )}

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
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
        // Clavier ouvert : la liste rétrécit, on garde le dernier message
        // visible juste au-dessus de la saisie.
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
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
            {uploadingType === 'voice'
              ? 'Envoi du vocal…'
              : uploadingType === 'image'
                ? "Envoi de l'image…"
                : 'Envoi du fichier…'}
          </Text>
        </View>
      )}

      {/* Voice bar: recording or preview state replaces the input */}
      <View
        className="bg-surface-card dark:bg-dark-300"
        style={{ paddingBottom: bottomGap }}
      >
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
              Enregistrement…
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
                Message vocal
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
          {voiceHint && (
            <View className="absolute -top-10 right-4 bg-ink-900/90 dark:bg-slate-700 rounded-xl px-3 py-2">
              <Text className="text-white text-xs">
                Maintenez pour enregistrer, relâchez pour envoyer
              </Text>
            </View>
          )}
          {/* Conteneur stable : le micro ne doit pas être démonté pendant
              qu'on le maintient, sinon le geste est perdu. */}
          <View className="flex-1 flex-row items-center mr-2" style={{ minHeight: 40 }}>
            {voiceState === 'holding' ? (
              <>
                <View className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2" />
                <Text className="text-ink-900 dark:text-white text-sm font-mono mr-3">
                  {formatDuration(recordSeconds)}
                </Text>
                <View
                  className="flex-1 flex-row items-center justify-center"
                  style={{ transform: [{ translateX: dragX }] }}
                >
                  <Ionicons name="chevron-back" size={16} color={mutedIcon} />
                  <Text className="text-ink-400 dark:text-slate-400 text-sm">
                    Glisser pour annuler
                  </Text>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => setAttachOpen(true)}
                  className="w-9 h-9 rounded-full bg-surface-chip dark:bg-dark-100 items-center justify-center mr-2"
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={20} color={mutedIcon} />
                </TouchableOpacity>
                <TextInput
                  className="flex-1 bg-surface-chip dark:bg-dark-100 text-ink-900 dark:text-white rounded-2xl px-4 py-2.5 text-base"
                  placeholder="Message..."
                  placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                  value={text}
                  onChangeText={handleChangeText}
                  multiline
                  maxLength={2000}
                  style={{ maxHeight: 120 }}
                  textAlignVertical="center"
                />
              </>
            )}
          </View>
          {text.trim().length > 0 && voiceState === 'idle' ? (
            <TouchableOpacity
              key="send"
              className="w-10 h-10 rounded-full bg-primary-600 items-center justify-center"
              activeOpacity={0.85}
              onPress={handleSend}
            >
              <Ionicons name="send" size={18} color="#ffffff" />
            </TouchableOpacity>
          ) : (
            <View key="mic">
              {voiceState === 'holding' && (
                <View className="absolute -top-16 left-0 right-0 items-center">
                  <View className="w-9 h-14 rounded-full bg-surface-chip dark:bg-dark-100 items-center justify-center">
                    <Ionicons name="lock-closed-outline" size={16} color={mutedIcon} />
                    <Ionicons name="chevron-up" size={14} color={mutedIcon} />
                  </View>
                </View>
              )}
              <View
                {...micResponder.panHandlers}
                accessibilityRole="button"
                accessibilityLabel="Maintenir pour enregistrer un message vocal"
                className={`w-10 h-10 rounded-full items-center justify-center ${
                  voiceState === 'holding' ? 'bg-red-500' : 'bg-primary-600'
                }`}
                style={{
                  transform: [{ scale: voiceState === 'holding' ? 1.3 : 1 }],
                }}
              >
                <Ionicons name="mic" size={18} color="#ffffff" />
              </View>
            </View>
          )}
        </View>
      )}
      </View>

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
            className="bg-surface-card dark:bg-dark-300 rounded-t-3xl px-6 pt-5"
            style={{ paddingBottom: insets.bottom + 24 }}
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
