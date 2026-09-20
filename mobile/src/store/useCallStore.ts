import { create } from 'zustand';

export type CallStatus =
  | 'idle'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'active'
  // Etat terminal bref : l'ecran reste affiche le temps de montrer pourquoi
  // l'appel s'est arrete, puis revient a 'idle'.
  | 'ended';

export interface CallPeer {
  id: string;
  name: string;
  avatar?: string;
}

interface CallState {
  status: CallStatus;
  callId: string | null;
  callType: 'audio' | 'video';
  peer: CallPeer | null;
  isCaller: boolean;
  // MediaStream instances from react-native-webrtc (kept as unknown to avoid
  // importing the native module into the store).
  localStream: unknown | null;
  remoteStream: unknown | null;
  muted: boolean;
  cameraOff: boolean;
  /** Haut-parleur : actif par defaut en visio, l'ecouteur en audio. */
  speaker: boolean;
  startedAt: number | null;
  /**
   * Raison affichee sous le nom quand l'appel se termine anormalement
   * (refuse, injoignable, sans reponse). Sans elle l'ecran se ferme sans
   * un mot et l'utilisateur croit que rien ne s'est passe.
   */
  endedReason: string | null;

  patch: (partial: Partial<CallState>) => void;
  reset: () => void;
}

const initialState = {
  status: 'idle' as CallStatus,
  callId: null,
  callType: 'audio' as 'audio' | 'video',
  peer: null,
  isCaller: false,
  localStream: null,
  remoteStream: null,
  muted: false,
  cameraOff: false,
  speaker: false,
  startedAt: null,
  endedReason: null,
};

export const useCallStore = create<CallState>((set) => ({
  ...initialState,
  patch: (partial) => set(partial),
  reset: () => set(initialState),
}));
