import { cssInterop } from 'nativewind';
import { Image } from 'expo-image';

/**
 * NativeWind n'applique `className` qu'aux composants natifs de React Native.
 * `expo-image` est une bibliotheque tierce : sans cet enregistrement, les
 * classes sont silencieusement ignorees, les avatars se retrouvent sans
 * dimensions et sont rendus en 0x0 — invisibles, sans repli sur les initiales
 * puisque l'URL, elle, est bien presente.
 *
 * A importer une seule fois, avant le premier rendu.
 */
cssInterop(Image, { className: 'style' });
