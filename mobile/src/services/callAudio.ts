import { setAudioModeAsync } from 'expo-audio';

/**
 * Routage du son pendant un appel.
 *
 * react-native-webrtc ne propose aucune API de sortie audio : sur Android il
 * laisse le flux sur l'ecouteur. Acceptable pour un appel audio tenu contre
 * l'oreille, inutilisable en visio, ou le telephone est pose devant soi.
 * expo-audio (deja embarque pour les messages vocaux) pilote le meme
 * AudioManager global, on s'en sert donc pour basculer haut-parleur/ecouteur.
 */
export async function setCallAudioRoute(speaker: boolean): Promise<void> {
  try {
    await setAudioModeAsync({
      // L'appel doit couper la musique des autres applications.
      interruptionMode: 'doNotMix',
      allowsRecording: true,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: !speaker,
    });
  } catch {
    // Routage indisponible sur cet appareil : l'appel reste utilisable.
  }
}

/** Rend la session audio aux autres usages (messages vocaux, musique). */
export async function releaseCallAudio(): Promise<void> {
  try {
    await setAudioModeAsync({
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // ignore
  }
}
