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

/** Sort d'un participant tel que le serveur le connait. */
export type MemberState = 'invited' | 'joined' | 'left' | 'declined' | 'missed';

export interface CallMember extends CallPeer {
  state: MemberState;
}

/**
 * Etat media d'un participant present dans la salle LiveKit.
 *
 * `videoTrack` est une reference de piste LiveKit (participant, publication,
 * source), gardee opaque pour ne pas importer le module natif dans le store.
 */
export interface MediaState {
  id: string;
  micOn: boolean;
  cameraOn: boolean;
  speaking: boolean;
  videoTrack: unknown | null;
}

/** Appel de groupe en cours dans un salon, pour proposer de le rejoindre. */
export interface RoomCall {
  callId: string;
  callType: 'audio' | 'video';
}

interface CallState {
  status: CallStatus;
  callId: string | null;
  callType: 'audio' | 'video';
  mode: 'direct' | 'group';
  /** Nom affiche en tete d'ecran : le correspondant, ou le groupe. */
  title: string;
  /**
   * Visage de l'appel : le correspondant d'un appel a deux, l'appelant d'un
   * appel de groupe entrant.
   */
  peer: CallPeer | null;
  /** Salon a l'origine d'un appel de groupe. */
  roomId: string | null;
  isCaller: boolean;
  /** Tous les invites, avec leur etat cote serveur (sonne, a refuse...). */
  members: CallMember[];
  /** Participants distants connectes a la salle media, par identifiant. */
  media: Record<string, MediaState>;
  /** Piste video locale (reference LiveKit), nulle camera coupee. */
  localVideo: unknown | null;
  localSpeaking: boolean;
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
  /** Appels de groupe en cours, par salon. Survit a la fin d'un appel. */
  roomCalls: Record<string, RoomCall>;

  patch: (partial: Partial<CallState>) => void;
  setRoomCall: (roomId: string, call: RoomCall | null) => void;
  reset: () => void;
}

const initialState = {
  status: 'idle' as CallStatus,
  callId: null,
  callType: 'audio' as 'audio' | 'video',
  mode: 'direct' as 'direct' | 'group',
  title: '',
  peer: null,
  roomId: null,
  isCaller: false,
  members: [] as CallMember[],
  media: {} as Record<string, MediaState>,
  localVideo: null,
  localSpeaking: false,
  muted: false,
  cameraOff: false,
  speaker: false,
  startedAt: null,
  endedReason: null,
};

export const useCallStore = create<CallState>((set) => ({
  ...initialState,
  roomCalls: {},
  patch: (partial) => set(partial),
  setRoomCall: (roomId, call) =>
    set((s) => {
      const next = { ...s.roomCalls };
      if (call) next[roomId] = call;
      else delete next[roomId];
      return { roomCalls: next };
    }),
  reset: () => set(initialState),
}));
