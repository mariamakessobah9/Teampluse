import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useCallStore,
  CallMember,
  CallPeer,
  MediaState,
} from '../store/useCallStore';
import { useAuthStore } from '../store/useAuthStore';
import { callManager, getVideoTrackView } from '../services/callManager';

const formatElapsed = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const ControlButton = ({
  icon,
  active,
  onPress,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active?: boolean;
  onPress: () => void;
  label: string;
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    accessibilityLabel={label}
    className={`w-14 h-14 rounded-full items-center justify-center mx-2 ${
      active ? 'bg-white' : 'bg-white/20'
    }`}
  >
    <Ionicons
      name={icon}
      size={24}
      color={active ? '#0f172a' : '#ffffff'}
    />
  </TouchableOpacity>
);

const Avatar = ({ user, size }: { user: CallPeer | null; size: number }) => (
  <View
    className="rounded-full bg-primary-700 items-center justify-center overflow-hidden"
    style={{ width: size, height: size }}
  >
    {user?.avatar ? (
      <Image
        source={{ uri: user.avatar }}
        style={{ width: size, height: size }}
        cachePolicy="memory-disk"
        transition={120}
      />
    ) : (
      <Text className="text-white font-bold" style={{ fontSize: size * 0.4 }}>
        {(user?.name || '?').charAt(0).toUpperCase()}
      </Text>
    )}
  </View>
);

const MEMBER_STATE_LABEL: Partial<Record<CallMember['state'], string>> = {
  invited: 'Sonnerie…',
  declined: 'A refusé',
  missed: 'Sans réponse',
  left: 'A quitté',
};

/**
 * Case de la grille d'un appel de groupe : la video si la personne filme,
 * son avatar sinon. Le liseré vert suit celui qui parle — sans lui, a
 * plusieurs et en audio, on ne sait jamais qui a la parole.
 */
function Tile({
  user,
  media,
  videoTrack,
  speaking,
  micOff,
  subtitle,
  mirror,
}: {
  user: CallPeer | null;
  media?: MediaState;
  videoTrack?: unknown | null;
  speaking?: boolean;
  micOff?: boolean;
  subtitle?: string;
  mirror?: boolean;
}) {
  const VideoTrack = getVideoTrackView();
  const track = videoTrack ?? media?.videoTrack ?? null;
  return (
    <View
      className={`flex-1 m-1 rounded-2xl overflow-hidden bg-dark-100 items-center justify-center ${
        speaking ? 'border-2 border-primary-400' : 'border-2 border-transparent'
      }`}
    >
      {track && VideoTrack ? (
        <VideoTrack
          trackRef={track}
          objectFit="cover"
          mirror={mirror}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : (
        <View className="items-center">
          <Avatar user={user} size={64} />
          {subtitle ? (
            <Text className="text-slate-300 text-xs mt-2">{subtitle}</Text>
          ) : null}
        </View>
      )}
      <View className="absolute bottom-2 left-2 right-2 flex-row items-center">
        {micOff && (
          <View className="bg-black/50 rounded-full p-1 mr-1">
            <Ionicons name="mic-off" size={12} color="#ffffff" />
          </View>
        )}
        <Text
          className="text-white text-xs font-semibold bg-black/40 rounded-md px-1.5 py-0.5"
          numberOfLines={1}
        >
          {user?.name || 'Inconnu'}
        </Text>
      </View>
    </View>
  );
}

/** Grille : une colonne jusqu'a deux cases, deux au-dela. */
function Grid({ children }: { children: React.ReactNode[] }) {
  const cols = children.length <= 2 ? 1 : 2;
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < children.length; i += cols) {
    rows.push(children.slice(i, i + cols));
  }
  return (
    <View className="flex-1 p-1">
      {rows.map((row, i) => (
        <View key={i} className="flex-1 flex-row">
          {row}
          {/* Derniere rangee incomplete : la case garde la largeur des autres. */}
          {row.length < cols && <View className="flex-1 m-1" />}
        </View>
      ))}
    </View>
  );
}

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const status = useCallStore((s) => s.status);
  const mode = useCallStore((s) => s.mode);
  const title = useCallStore((s) => s.title);
  const peer = useCallStore((s) => s.peer);
  const callType = useCallStore((s) => s.callType);
  const members = useCallStore((s) => s.members);
  const media = useCallStore((s) => s.media);
  const localVideo = useCallStore((s) => s.localVideo);
  const localSpeaking = useCallStore((s) => s.localSpeaking);
  const muted = useCallStore((s) => s.muted);
  const cameraOff = useCallStore((s) => s.cameraOff);
  const speaker = useCallStore((s) => s.speaker);
  const startedAt = useCallStore((s) => s.startedAt);
  const endedReason = useCallStore((s) => s.endedReason);
  const me = useAuthStore((s) => s.user);

  const [elapsed, setElapsed] = useState(0);

  const visible =
    status === 'outgoing' ||
    status === 'connecting' ||
    status === 'active' ||
    status === 'ended';

  useEffect(() => {
    if (status !== 'active' || !startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () =>
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, startedAt]);

  const VideoTrack = getVideoTrackView();
  const isVideo = callType === 'video';
  const inRoom = Object.keys(media).length;

  const statusLabel =
    status === 'outgoing'
      ? 'Sonnerie…'
      : status === 'connecting'
        ? 'Connexion…'
        : status === 'ended'
          ? endedReason || 'Appel terminé.'
          : mode === 'group'
            ? `${formatElapsed(elapsed)} · ${inRoom + 1} participant${inRoom ? 's' : ''}`
            : formatElapsed(elapsed);

  // Appel a deux : la presentation plein ecran d'origine. Le groupe passe en
  // grille des qu'il y a quelqu'un a montrer.
  const showGrid = mode === 'group' && status !== 'ended';
  const remote = peer ? media[peer.id] : Object.values(media)[0];
  const showRemoteVideo =
    !showGrid && isVideo && status === 'active' && !!remote?.videoTrack && !!VideoTrack;
  const showLocalPip =
    !showGrid && isVideo && status !== 'ended' && !!localVideo && !cameraOff && !!VideoTrack;

  const renderGrid = () => {
    const known = new Map(members.map((m) => [m.id, m]));
    const tiles: React.ReactNode[] = [
      <Tile
        key="me"
        user={me ? { id: me.id, name: 'Vous', avatar: me.avatar } : null}
        videoTrack={cameraOff ? null : localVideo}
        speaking={localSpeaking}
        micOff={muted}
        mirror
      />,
    ];
    // Presents dans la salle, puis ceux chez qui ca sonne encore.
    for (const m of Object.values(media)) {
      tiles.push(
        <Tile
          key={m.id}
          user={known.get(m.id) ?? { id: m.id, name: '…' }}
          media={m}
          speaking={m.speaking}
          micOff={!m.micOn}
        />,
      );
    }
    for (const m of members) {
      if (media[m.id] || m.state !== 'invited') continue;
      tiles.push(
        <Tile key={m.id} user={m} subtitle={MEMBER_STATE_LABEL[m.state]} />,
      );
    }
    return <Grid>{tiles.slice(0, 12)}</Grid>;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => undefined}>
      <View className="flex-1 bg-dark-300">
        {showGrid ? (
          <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
            <View className="items-center mb-2 px-6">
              <Text className="text-white text-lg font-bold" numberOfLines={1}>
                {title || 'Appel de groupe'}
              </Text>
              <Text className="text-slate-300 text-sm">{statusLabel}</Text>
            </View>
            <View className="flex-1" style={{ marginBottom: 150 }}>
              {renderGrid()}
            </View>
          </View>
        ) : showRemoteVideo ? (
          <VideoTrack
            trackRef={remote!.videoTrack}
            objectFit="cover"
            style={{ flex: 1 }}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <View className="mb-5">
              <Avatar user={peer} size={128} />
            </View>
            <Text className="text-white text-2xl font-bold text-center">
              {title || peer?.name || 'Inconnu'}
            </Text>
            <Text className="text-slate-300 text-base mt-2 text-center">
              {statusLabel}
            </Text>
          </View>
        )}

        {/* Apercu local (incrustation) pour un appel video a deux */}
        {showLocalPip && (
          <View
            className="absolute right-4 rounded-2xl overflow-hidden bg-dark-100"
            style={{ top: insets.top + 12, width: 110, height: 160 }}
          >
            <VideoTrack
              trackRef={localVideo}
              objectFit="cover"
              mirror
              style={{ flex: 1 }}
            />
          </View>
        )}

        {showRemoteVideo && (
          <View
            className="absolute left-0 right-0 items-center"
            style={{ top: insets.top + 12 }}
          >
            <Text className="text-white text-lg font-bold">
              {title || peer?.name || 'Inconnu'}
            </Text>
            <Text className="text-slate-200 text-sm">{statusLabel}</Text>
          </View>
        )}

        {/* Commandes */}
        {status !== 'ended' && (
          <View
            className="absolute left-0 right-0 flex-row items-center justify-center"
            style={{ bottom: insets.bottom + 40 }}
          >
            <ControlButton
              icon={muted ? 'mic-off' : 'mic'}
              active={muted}
              label={muted ? 'Réactiver le micro' : 'Couper le micro'}
              onPress={() => callManager.toggleMute()}
            />

            <ControlButton
              icon={speaker ? 'volume-high' : 'volume-medium'}
              active={speaker}
              label={
                speaker ? 'Passer sur l’écouteur' : 'Passer sur le haut-parleur'
              }
              onPress={() => callManager.toggleSpeaker()}
            />

            {isVideo && (
              <ControlButton
                icon={cameraOff ? 'videocam-off' : 'videocam'}
                active={cameraOff}
                label={
                  cameraOff ? 'Activer la caméra' : 'Désactiver la caméra'
                }
                onPress={() => callManager.toggleCamera()}
              />
            )}

            {isVideo && (
              <ControlButton
                icon="camera-reverse"
                label="Changer de caméra"
                onPress={() => callManager.switchCamera()}
              />
            )}

            <TouchableOpacity
              onPress={() => callManager.endCall()}
              activeOpacity={0.85}
              accessibilityLabel="Raccrocher"
              className="w-16 h-16 rounded-full items-center justify-center mx-2 bg-red-500"
            >
              <Ionicons name="call" size={28} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}
