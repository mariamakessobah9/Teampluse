import { Platform } from 'react-native';

/**
 * Session audio des appels, pilotee par LiveKit.
 *
 * LiveKit gere lui-meme le mode « communication » d'Android (annulation
 * d'echo, focus audio) : passer par expo-audio en parallele se battrait avec
 * lui pour l'AudioManager global. Charge prudemment comme le reste du SDK,
 * pour qu'une build sans le module natif ne plante pas au demarrage.
 */
let AudioSession: any = null;
let AndroidAudioTypePresets: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lk = require('@livekit/react-native');
  AudioSession = lk.AudioSession;
  AndroidAudioTypePresets = lk.AndroidAudioTypePresets;
} catch {
  AudioSession = null;
}

let active = false;

/**
 * Ouvre la session audio avant la connexion a la salle : la configuration
 * doit etre posee avant que le moteur WebRTC ne demarre, sans quoi Android
 * reste sur le profil media (pas d'annulation d'echo, volume des alarmes).
 */
export async function startCallAudio(speaker: boolean): Promise<void> {
  if (!AudioSession) return;
  try {
    await AudioSession.configureAudio({
      android: {
        preferredOutputList: speaker
          ? ['bluetooth', 'headset', 'speaker', 'earpiece']
          : ['bluetooth', 'headset', 'earpiece', 'speaker'],
        audioTypeOptions: AndroidAudioTypePresets.communication,
      },
      ios: { defaultOutput: speaker ? 'speaker' : 'earpiece' },
    });
    await AudioSession.startAudioSession();
    active = true;
  } catch {
    // Routage indisponible sur cet appareil : l'appel reste utilisable.
  }
}

/**
 * Bascule haut-parleur / ecouteur. Hors haut-parleur, un casque ou un
 * appareil Bluetooth branche passe avant l'ecouteur du telephone.
 */
export async function setCallAudioRoute(speaker: boolean): Promise<void> {
  if (!AudioSession || !active) return;
  try {
    if (Platform.OS === 'ios') {
      await AudioSession.selectAudioOutput(speaker ? 'force_speaker' : 'default');
      return;
    }
    const outputs: string[] = await AudioSession.getAudioOutputs();
    const order = speaker
      ? ['speaker']
      : ['bluetooth', 'headset', 'earpiece'];
    const target = order.find((o) => outputs.includes(o));
    if (target) await AudioSession.selectAudioOutput(target);
  } catch {
    // ignore
  }
}

/** Rend la session audio aux autres usages (messages vocaux, musique). */
export async function releaseCallAudio(): Promise<void> {
  if (!AudioSession || !active) return;
  active = false;
  try {
    await AudioSession.stopAudioSession();
  } catch {
    // ignore
  }
}
