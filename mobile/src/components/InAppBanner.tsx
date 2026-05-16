import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBannerStore } from '../store/useBannerStore';
import { navigateToRoom } from '../navigation/navigationRef';

const AUTO_HIDE_MS = 4000;

export default function InAppBanner() {
  const visible = useBannerStore((s) => s.visible);
  const title = useBannerStore((s) => s.title);
  const body = useBannerStore((s) => s.body);
  const roomId = useBannerStore((s) => s.roomId);
  const hide = useBannerStore((s) => s.hide);

  const translateY = useRef(new Animated.Value(-140)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.timing(translateY, {
      toValue: visible ? 0 : -140,
      duration: 250,
      useNativeDriver: true,
    }).start();
    if (visible) {
      hideTimer.current = setTimeout(hide, AUTO_HIDE_MS);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visible]);

  const handlePress = () => {
    hide();
    if (roomId) navigateToRoom(roomId);
  };

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        transform: [{ translateY }],
        zIndex: 1000,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        className="mx-3 mt-12 bg-surface-card dark:bg-dark-100 rounded-2xl px-4 py-3 flex-row items-center"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 10,
          elevation: 8,
        }}
      >
        <View className="w-10 h-10 rounded-full bg-primary-600 items-center justify-center mr-3">
          <Ionicons name="chatbubble-ellipses" size={20} color="#ffffff" />
        </View>
        <View className="flex-1">
          <Text
            numberOfLines={1}
            className="text-ink-900 dark:text-white font-bold text-sm"
          >
            {title}
          </Text>
          <Text
            numberOfLines={1}
            className="text-ink-500 dark:text-slate-300 text-sm"
          >
            {body}
          </Text>
        </View>
        <TouchableOpacity onPress={hide} className="p-1 ml-2">
          <Ionicons name="close" size={18} color="#9ca3af" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}
