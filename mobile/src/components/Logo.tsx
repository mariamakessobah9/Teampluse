import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';

const MARK = require('../../assets/icon.png');

/**
 * Pastille de marque TeamPulse, reprise de l'icone de l'application pour que
 * l'ecran d'accueil et l'interieur de l'app montrent la meme image.
 *
 * Les dimensions passent par `style` et non par `className` : le rayon de
 * bordure doit rester proportionnel a la taille demandee.
 */
export default function Logo({
  size = 32,
  rounded = 'squircle',
}: {
  size?: number;
  /** `squircle` pour un badge d'app, `circle` pour un alignement sur un avatar. */
  rounded?: 'squircle' | 'circle';
}) {
  const radius = rounded === 'circle' ? size / 2 : size * 0.28;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
      }}
    >
      <Image
        source={MARK}
        style={{ width: size, height: size }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    </View>
  );
}
