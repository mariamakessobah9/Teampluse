import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useCallStore } from '../store/useCallStore';
import { callManager, getRTCView } from '../services/callManager';

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

export default function CallScreen() {
  const status = useCallStore((s) => s.status);
  const peer = useCallStore((s) => s.peer);
  const callType = useCallStore((s) => s.callType);
  const localStream = useCallStore((s) => s.localStream);
  const remoteStream = useCallStore((s) => s.remoteStream);
  const muted = useCallStore((s) => s.muted);
  const cameraOff = useCallStore((s) => s.cameraOff);
  const speaker = useCallStore((s) => s.speaker);
  const startedAt = useCallStore((s) => s.startedAt);
  const endedReason = useCallStore((s) => s.endedReason);

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

  const RTCView = getRTCView();
  const isVideo = callType === 'video';
  const showRemoteVideo =
    isVideo && status === 'active' && !!remoteStream && !!RTCView;
  const showLocalVideo =
    isVideo &&
    status !== 'ended' &&
    !!localStream &&
    !cameraOff &&
    !!RTCView;

  const statusLabel =
    status === 'outgoing'
      ? 'Sonnerie…'
      : status === 'connecting'
        ? 'Connexion…'
        : status === 'ended'
          ? endedReason || 'Appel terminé.'
          : formatElapsed(elapsed);

  return (
    <Modal visible={visible} animationType="slide">
      <View className="flex-1 bg-dark-300">
        {/* Remote video fills the screen for video calls */}
        {showRemoteVideo ? (
          <RTCView
            streamURL={(remoteStream as any).toURL()}
            objectFit="cover"
            style={{ flex: 1 }}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <View className="w-32 h-32 rounded-full bg-primary-700 items-center justify-center overflow-hidden mb-5">
              {peer?.avatar ? (
                <Image
                  source={{ uri: peer.avatar }}
                  className="w-32 h-32"
                  cachePolicy="memory-disk"
                  transition={120}
                />
              ) : (
                <Text className="text-white text-5xl font-bold">
                  {(peer?.name || '?').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <Text className="text-white text-2xl font-bold text-center">
              {peer?.name || 'Inconnu'}
            </Text>
            <Text className="text-slate-300 text-base mt-2 text-center">
              {statusLabel}
            </Text>
          </View>
        )}

        {/* Local video preview (picture-in-picture) */}
        {showLocalVideo && (
          <View
            className="absolute top-14 right-4 rounded-2xl overflow-hidden bg-dark-100"
            style={{ width: 110, height: 160 }}
          >
            <RTCView
              streamURL={(localStream as any).toURL()}
              objectFit="cover"
              mirror
              style={{ flex: 1 }}
            />
          </View>
        )}

        {/* Top status bar for video calls */}
        {showRemoteVideo && (
          <View className="absolute top-14 left-0 right-0 items-center">
            <Text className="text-white text-lg font-bold">
              {peer?.name || 'Inconnu'}
            </Text>
            <Text className="text-slate-200 text-sm">{statusLabel}</Text>
          </View>
        )}

        {/* Controls */}
        {status !== 'ended' && (
          <View className="absolute bottom-16 left-0 right-0 flex-row items-center justify-center">
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
