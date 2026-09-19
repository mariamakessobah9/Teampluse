import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

/**
 * Remplace la page blanche affichee pendant le chargement des conversations.
 * Une pulsation suffit : un shimmer en degrade couterait une dependance de
 * plus pour un ecran visible une seconde.
 */
function usePulse() {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return opacity;
}

function SkeletonRow({ opacity }: { opacity: Animated.Value }) {
  return (
    <Animated.View style={{ opacity }} className="flex-row items-center px-4 py-3">
      <View className="w-12 h-12 rounded-full bg-ink-200 dark:bg-dark-100" />
      <View className="flex-1 ml-3">
        <View className="h-3.5 w-1/2 rounded-full bg-ink-200 dark:bg-dark-100" />
        <View className="h-3 w-3/4 rounded-full bg-ink-200 dark:bg-dark-100 mt-2" />
      </View>
      <View className="h-3 w-10 rounded-full bg-ink-200 dark:bg-dark-100 ml-3" />
    </Animated.View>
  );
}

export default function ChatListSkeleton({ rows = 7 }: { rows?: number }) {
  const opacity = usePulse();

  return (
    <View className="pt-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} opacity={opacity} />
      ))}
    </View>
  );
}
