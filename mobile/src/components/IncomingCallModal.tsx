import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Vibration } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useCallStore } from '../store/useCallStore';
import { callManager } from '../services/callManager';

// Vibre par salves tant que l'appel sonne : sans retour physique, un appel
// recu ecran eteint passe totalement inapercu.
const RING_PATTERN = [0, 700, 900];

export default function IncomingCallModal() {
  const status = useCallStore((s) => s.status);
  const peer = useCallStore((s) => s.peer);
  const callType = useCallStore((s) => s.callType);

  const visible = status === 'incoming';

  useEffect(() => {
    if (!visible) return;
    Vibration.vibrate(RING_PATTERN, true);
    return () => Vibration.cancel();
  }, [visible]);

  return (
    <Modal visible={visible} transparent={false} animationType="slide">
      <View className="flex-1 bg-dark-300 items-center justify-between py-20">
        <View className="items-center mt-10">
          <Text className="text-slate-300 text-base mb-6">
            {callType === 'video'
              ? 'Appel vidéo entrant'
              : 'Appel entrant'}
          </Text>
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
          <Text className="text-white text-2xl font-bold">
            {peer?.name || 'Inconnu'}
          </Text>
        </View>

        <View className="flex-row items-center justify-around w-full px-12">
          <View className="items-center">
            <TouchableOpacity
              onPress={() => callManager.rejectCall()}
              activeOpacity={0.85}
              className="w-16 h-16 rounded-full bg-red-500 items-center justify-center"
            >
              <Ionicons name="close" size={30} color="#ffffff" />
            </TouchableOpacity>
            <Text className="text-slate-300 text-xs mt-2">Refuser</Text>
          </View>
          <View className="items-center">
            <TouchableOpacity
              onPress={() => callManager.acceptCall()}
              activeOpacity={0.85}
              className="w-16 h-16 rounded-full bg-primary-500 items-center justify-center"
            >
              <Ionicons
                name={callType === 'video' ? 'videocam' : 'call'}
                size={28}
                color="#ffffff"
              />
            </TouchableOpacity>
            <Text className="text-slate-300 text-xs mt-2">Répondre</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
