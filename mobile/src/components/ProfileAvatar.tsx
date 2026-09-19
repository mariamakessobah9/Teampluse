import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';

const initialsOf = (name?: string | null) =>
  (name || 'U')
    .split(' ')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

/**
 * Avatar rond des ecrans de profil. Retombe sur les initiales tant qu'aucune
 * photo n'est definie, mais aussi quand son chargement echoue : une URL
 * Cloudinary perimee laissait sinon un disque vide.
 */
export default function ProfileAvatar({
  uri,
  name,
  children,
}: {
  uri?: string | null;
  name?: string | null;
  /** Surcouche optionnelle, par ex. l'indicateur de televersement. */
  children?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  // Sans ce reset, choisir une nouvelle photo apres un echec garderait les
  // initiales affichees.
  useEffect(() => setFailed(false), [uri]);

  return (
    <View className="w-28 h-28 rounded-full border-[3px] border-primary-500 items-center justify-center bg-primary-100 dark:bg-primary-900 overflow-hidden">
      {uri && !failed ? (
        <Image
          source={{ uri }}
          className="w-28 h-28 rounded-full"
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text className="text-primary-700 dark:text-primary-300 text-3xl font-bold">
          {initialsOf(name)}
        </Text>
      )}
      {children}
    </View>
  );
}
