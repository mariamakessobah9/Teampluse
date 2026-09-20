import { Permission, PermissionsAndroid, Platform } from 'react-native';

/**
 * Permission micro/camera refusee par l'utilisateur.
 *
 * `blocked` distingue un simple refus (on peut redemander) d'un refus
 * definitif ("ne plus demander") qui impose un passage par les reglages
 * systeme — le message affiche doit alors etre different.
 */
export class MediaPermissionError extends Error {
  readonly blocked: boolean;

  constructor(message: string, blocked: boolean) {
    super(message);
    this.name = 'MediaPermissionError';
    this.blocked = blocked;
  }
}

const RESULTS = PermissionsAndroid.RESULTS;

/**
 * Demande les permissions natives necessaires a un appel.
 *
 * react-native-webrtc ne les demande pas lui-meme : sans cet appel,
 * `getUserMedia` echoue immediatement sur Android 6+ et l'appel ne demarre
 * jamais, meme si les permissions sont declarees dans le manifeste.
 */
export async function ensureCallPermissions(video: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;

  const required: Permission[] = [
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ];
  if (video) required.push(PermissionsAndroid.PERMISSIONS.CAMERA);

  const granted = await PermissionsAndroid.requestMultiple(required);

  const denied = required.filter((p) => granted[p] !== RESULTS.GRANTED);
  if (denied.length > 0) {
    const blocked = denied.some(
      (p) => granted[p] === RESULTS.NEVER_ASK_AGAIN,
    );
    const needsCamera = denied.includes(
      PermissionsAndroid.PERMISSIONS.CAMERA,
    );
    const what =
      denied.length > 1
        ? 'au micro et à la caméra'
        : needsCamera
          ? 'à la caméra'
          : 'au micro';
    throw new MediaPermissionError(
      blocked
        ? `TeamPulse n'a pas accès ${what}. Ouvrez Réglages > Applications > ` +
          'TeamPulse > Autorisations pour l’activer.'
        : `L'accès ${what} est nécessaire pour passer un appel.`,
      blocked,
    );
  }

  // Bluetooth : facultatif. Sans lui l'appel fonctionne, il ne sortira
  // simplement pas sur une oreillette. Un refus ne doit donc pas bloquer.
  if (Number(Platform.Version) >= 31) {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ).catch(() => undefined);
  }
}
