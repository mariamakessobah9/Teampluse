import api from './api';
import { getSocket } from './socket';
import {
  useCallStore,
  CallMember,
  CallPeer,
  MediaState,
} from '../store/useCallStore';
import { useAuthStore } from '../store/useAuthStore';
import { ensureCallPermissions } from './mediaPermissions';
import { releaseCallAudio, setCallAudioRoute, startCallAudio } from './callAudio';

// Le SDK LiveKit embarque du code natif (sa propre build de WebRTC). On le
// charge prudemment pour que le bundle JS tourne encore sur une build qui ne
// l'inclut pas : les appels y restent simplement indisponibles.
let LK: any = null;
let LKClient: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  LK = require('@livekit/react-native');
  // Installe RTCPeerConnection & co. dans le global, ce qu'attend
  // livekit-client : sans cela la connexion echoue des le premier appel.
  LK.registerGlobals();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  LKClient = require('livekit-client');
} catch {
  LK = null;
  LKClient = null;
}

export const isCallSupported = (): boolean => !!LK && !!LKClient;
export const getVideoTrackView = (): any => LK?.VideoTrack ?? null;

/** Au-dela, un appel qui sonne dans le vide est classe sans reponse. */
const RING_TIMEOUT_MS = 45_000;
/** Delai au-dela duquel une connexion a la salle qui n'aboutit pas est abandonnee. */
const CONNECT_TIMEOUT_MS = 30_000;
/** Attente maximale d'une reponse du serveur a une demande d'appel. */
const ACK_TIMEOUT_MS = 10_000;
/** Duree d'affichage du motif de fin avant de refermer l'ecran d'appel. */
const ENDED_DISPLAY_MS = 2200;

export const CALL_END_REASONS = {
  unavailable: "Cette personne n'est pas joignable.",
  rejected: 'Appel refusé.',
  timeout: 'Pas de réponse.',
  busy: 'Cette personne est déjà en appel.',
  failed: 'Connexion impossible. Vérifiez votre réseau.',
  ended: 'Appel terminé.',
} as const;

export type CallEndReason = keyof typeof CALL_END_REASONS;

interface ServerMember {
  id: string;
  name: string;
  avatar?: string;
  state: CallMember['state'];
}

type CallAck =
  | {
      ok: true;
      callId: string;
      callType: 'audio' | 'video';
      mode: 'direct' | 'group';
      participants: ServerMember[];
    }
  | { ok: false; error: string };

export interface IncomingCallPayload {
  callId: string;
  callType: 'audio' | 'video';
  mode?: 'direct' | 'group';
  caller: CallPeer;
  room?: { id: string; name: string | null } | null;
  participants?: ServerMember[];
}

/** Qui appeler : une ou plusieurs personnes, ou tous les membres d'un salon. */
export interface CallTarget {
  peers?: CallPeer[];
  roomId?: string;
  /** Nom du salon, affiche pendant la sonnerie. */
  title?: string;
}

let room: any = null;
let ringTimer: ReturnType<typeof setTimeout> | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let endedTimer: ReturnType<typeof setTimeout> | null = null;

const store = () => useCallStore.getState();
const myId = () => useAuthStore.getState().user?.id;

const clearTimer = (t: ReturnType<typeof setTimeout> | null) => {
  if (t) clearTimeout(t);
  return null;
};

/**
 * Le socket peut etre absent (pas encore connecte) ou coupe (reseau perdu,
 * application revenue du second plan). Emettre dans le vide donnerait un
 * appel qui sonne cote appelant sans jamais atteindre personne.
 */
function requireSocket(): any {
  const socket = getSocket();
  if (!socket || !socket.connected) {
    throw new Error('Pas de connexion au serveur. Réessayez dans un instant.');
  }
  return socket;
}

async function request(event: string, payload: unknown): Promise<CallAck> {
  const socket = requireSocket();
  try {
    return (await socket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck(event, payload)) as CallAck;
  } catch {
    return { ok: false, error: 'Le serveur ne répond pas. Réessayez.' };
  }
}

/** Liste des invites, sans soi-meme : on ne s'affiche pas en « sonne ». */
const toMembers = (list: ServerMember[] | undefined): CallMember[] =>
  (list ?? [])
    .filter((m) => m.id !== myId())
    .map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, state: m.state }));

/** Titre d'un appel de groupe sans salon : les prenoms des invites. */
const namesTitle = (members: { name: string }[]): string => {
  const names = members.map((m) => m.name.split(' ')[0]);
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} et ${names.length - 2} autres`;
};

// ---------------------------------------------------------------------------
// Salle media
// ---------------------------------------------------------------------------

/**
 * Relit l'etat media de la salle et le pousse dans le store.
 *
 * Plus simple et plus sur que de suivre chaque evenement un par un : une
 * piste publiee, coupee, puis republiee donnerait sinon des etats croises.
 */
function syncMedia() {
  if (!room) return;
  const { Track } = LKClient;
  const media: Record<string, MediaState> = {};

  for (const p of room.remoteParticipants.values()) {
    const cam = p.getTrackPublication(Track.Source.Camera);
    const mic = p.getTrackPublication(Track.Source.Microphone);
    const cameraOn = !!cam?.track && !cam.isMuted;
    media[p.identity] = {
      id: p.identity,
      micOn: !!mic && !mic.isMuted,
      cameraOn,
      speaking: p.isSpeaking,
      videoTrack: cameraOn
        ? { participant: p, publication: cam, source: Track.Source.Camera }
        : null,
    };
  }

  const local = room.localParticipant;
  const localCam = local.getTrackPublication(Track.Source.Camera);
  const localVideo =
    localCam?.track && !localCam.isMuted
      ? { participant: local, publication: localCam, source: Track.Source.Camera }
      : null;

  store().patch({ media, localVideo, localSpeaking: local.isSpeaking });

  // L'appel est « etabli » des qu'une autre personne est dans la salle : le
  // media circule alors vraiment, contrairement a une simple acceptation.
  if (Object.keys(media).length > 0) markActive();
}

function markActive() {
  const { status, startedAt } = store();
  if (status !== 'connecting' && status !== 'outgoing') return;
  connectTimer = clearTimer(connectTimer);
  ringTimer = clearTimer(ringTimer);
  store().patch({ status: 'active', startedAt: startedAt ?? Date.now() });
}

async function connectRoom(callId: string, callType: 'audio' | 'video') {
  const { data } = await api.get(`/calls/${encodeURIComponent(callId)}/token`);
  // L'appel a pu etre raccroche pendant la demande de jeton.
  if (store().callId !== callId) return;

  const { Room, RoomEvent } = LKClient;
  const next = new Room({
    adaptiveStream: true,
    // Coupe l'envoi des couches video que personne ne regarde : en groupe,
    // c'est ce qui garde le debit montant d'un telephone raisonnable.
    dynacast: true,
  });
  room = next;

  const refresh = () => {
    if (room === next) syncMedia();
  };
  next
    .on(RoomEvent.ParticipantConnected, refresh)
    .on(RoomEvent.ParticipantDisconnected, refresh)
    .on(RoomEvent.TrackSubscribed, refresh)
    .on(RoomEvent.TrackUnsubscribed, refresh)
    .on(RoomEvent.TrackMuted, refresh)
    .on(RoomEvent.TrackUnmuted, refresh)
    .on(RoomEvent.LocalTrackPublished, refresh)
    .on(RoomEvent.LocalTrackUnpublished, refresh)
    .on(RoomEvent.ActiveSpeakersChanged, refresh)
    .on(RoomEvent.Disconnected, (reason?: number) => {
      if (room !== next) return;
      room = null;
      const status = store().status;
      if (status === 'idle' || status === 'ended') return;
      getSocket()?.emit('call-end', { callId });
      // Salle fermee par le serveur : l'appel est simplement fini, meme si
      // l'evenement socket correspondant n'est pas encore arrive. Sinon,
      // reseau perdu au-dela de ce que les reconnexions savent rattraper.
      finish(
        reason === LKClient.DisconnectReason?.ROOM_DELETED ? undefined : 'failed',
      );
    });

  await startCallAudio(store().speaker);
  await next.connect(data.url, data.token, { autoSubscribe: true });
  if (room !== next) {
    // Raccroche pendant la connexion.
    await next.disconnect();
    return;
  }

  await next.localParticipant.setMicrophoneEnabled(!store().muted);
  if (callType === 'video') {
    await next.localParticipant.setCameraEnabled(true);
  }
  syncMedia();
}

function cleanup() {
  ringTimer = clearTimer(ringTimer);
  connectTimer = clearTimer(connectTimer);
  const current = room;
  room = null;
  if (current) {
    current.disconnect().catch(() => undefined);
  }
  void releaseCallAudio();
}

/**
 * Termine l'appel en cours en affichant brievement pourquoi. `reason`
 * omise = raccrochage normal, l'ecran se referme aussitot.
 */
function finish(reason?: CallEndReason | string) {
  if (store().status === 'idle') return;
  cleanup();
  endedTimer = clearTimer(endedTimer);

  if (!reason) {
    store().reset();
    return;
  }

  store().patch({
    status: 'ended',
    endedReason:
      CALL_END_REASONS[reason as CallEndReason] ?? reason,
    media: {},
    localVideo: null,
  });
  endedTimer = setTimeout(() => {
    endedTimer = null;
    if (store().status === 'ended') store().reset();
  }, ENDED_DISPLAY_MS);
}

function armConnectTimer(callId: string) {
  connectTimer = clearTimer(connectTimer);
  connectTimer = setTimeout(() => {
    connectTimer = null;
    // Seul dans la salle d'un appel de groupe, on attend les autres : ce
    // n'est pas un echec de connexion.
    if (store().status === 'connecting' && !room) {
      getSocket()?.emit('call-end', { callId });
      finish('failed');
    }
  }, CONNECT_TIMEOUT_MS);
}

/** Un ecran de fin encore affiche ne doit pas bloquer un nouvel appel. */
function ensureIdle() {
  const current = store().status;
  if (current !== 'idle' && current !== 'ended') {
    throw new Error('Un appel est déjà en cours.');
  }
  if (current === 'ended') {
    endedTimer = clearTimer(endedTimer);
    store().reset();
  }
}

function applyAudioRoute(callType: 'audio' | 'video') {
  const speaker = callType === 'video';
  store().patch({ speaker });
  void setCallAudioRoute(speaker);
}

/** Echec d'entree dans un appel : message bref puis fermeture. */
function failEntry(callId: string | null, message: string) {
  if (callId) getSocket()?.emit('call-end', { callId });
  finish(message);
}

export const callManager = {
  /**
   * Lance un appel vers une personne, plusieurs, ou un salon entier. Dans
   * un salon ou un appel est deja en cours, le serveur nous y fait entrer
   * au lieu d'en ouvrir un second.
   */
  async startCall(target: CallTarget, callType: 'audio' | 'video') {
    if (!isCallSupported()) {
      throw new Error(
        "Les appels ne sont pas disponibles dans cette version de l'application.",
      );
    }
    ensureIdle();

    const peers = target.peers ?? [];
    const isGroup = !!target.roomId || peers.length > 1;
    await ensureCallPermissions(callType === 'video');

    store().patch({
      status: 'outgoing',
      callId: null,
      callType,
      mode: isGroup ? 'group' : 'direct',
      title: target.title || (isGroup ? namesTitle(peers) : peers[0]?.name ?? ''),
      peer: isGroup ? null : peers[0] ?? null,
      roomId: target.roomId ?? null,
      isCaller: true,
      members: peers.map((p) => ({ ...p, state: 'invited' as const })),
      media: {},
      localVideo: null,
      muted: false,
      cameraOff: false,
      startedAt: null,
      endedReason: null,
    });
    applyAudioRoute(callType);

    const ack = await request('call-initiate', {
      callType,
      calleeIds: target.roomId ? undefined : peers.map((p) => p.id),
      roomId: target.roomId,
    });
    // Raccroche pendant l'attente du serveur.
    if (store().status !== 'outgoing') {
      if (ack.ok) getSocket()?.emit('call-end', { callId: ack.callId });
      return;
    }
    if (!ack.ok) {
      cleanup();
      store().reset();
      throw new Error(ack.error);
    }

    const members = toMembers(ack.participants);
    // Un appel de salon deja en cours : on le rejoint, personne ne sonne
    // pour nous.
    const joinedExisting = members.some((m) => m.state === 'joined');
    store().patch({
      callId: ack.callId,
      callType: ack.callType,
      mode: ack.mode,
      members,
      isCaller: !joinedExisting,
      status: joinedExisting ? 'connecting' : 'outgoing',
    });

    try {
      await connectRoom(ack.callId, ack.callType);
    } catch {
      failEntry(ack.callId, 'failed');
      return;
    }

    // Filet cote client : si le serveur ne repond jamais (instance
    // redemarree, evenement perdu), l'appel ne sonne pas eternellement.
    ringTimer = clearTimer(ringTimer);
    ringTimer = setTimeout(() => {
      ringTimer = null;
      if (store().status !== 'outgoing') return;
      getSocket()?.emit('call-end', { callId: ack.callId });
      finish('timeout');
    }, RING_TIMEOUT_MS + 5_000);
  },

  /** Rejoindre l'appel de groupe en cours dans un salon. */
  async joinRoomCall(roomId: string, title: string) {
    const roomCall = store().roomCalls[roomId];
    if (!roomCall) return;
    if (!isCallSupported()) {
      throw new Error(
        "Les appels ne sont pas disponibles dans cette version de l'application.",
      );
    }
    ensureIdle();
    await ensureCallPermissions(roomCall.callType === 'video');

    store().patch({
      status: 'connecting',
      callId: roomCall.callId,
      callType: roomCall.callType,
      mode: 'group',
      title,
      peer: null,
      roomId,
      isCaller: false,
      members: [],
      startedAt: null,
      endedReason: null,
    });
    applyAudioRoute(roomCall.callType);

    const ack = await request('call-join', { callId: roomCall.callId });
    if (!ack.ok) {
      store().setRoomCall(roomId, null);
      failEntry(null, ack.error);
      return;
    }
    store().patch({ members: toMembers(ack.participants) });
    armConnectTimer(ack.callId);
    try {
      await connectRoom(ack.callId, ack.callType);
    } catch {
      failEntry(ack.callId, 'failed');
    }
  },

  receiveIncomingCall(data: IncomingCallPayload) {
    if (!isCallSupported()) {
      getSocket()?.emit('call-reject', { callId: data.callId });
      return;
    }
    const status = store().status;
    if (status !== 'idle' && status !== 'ended') {
      // Deja en ligne : on refuse tout de suite plutot que de laisser
      // l'appelant attendre la fin du delai de sonnerie.
      if (data.callId !== store().callId) {
        getSocket()?.emit('call-reject', { callId: data.callId, busy: true });
      }
      return;
    }
    endedTimer = clearTimer(endedTimer);

    const members = toMembers(data.participants);
    const isGroup = data.mode === 'group';
    store().patch({
      status: 'incoming',
      callId: data.callId,
      callType: data.callType,
      mode: isGroup ? 'group' : 'direct',
      title: isGroup
        ? data.room?.name || namesTitle(members)
        : data.caller?.name ?? '',
      peer: data.caller,
      roomId: data.room?.id ?? null,
      isCaller: false,
      members,
      media: {},
      localVideo: null,
      muted: false,
      cameraOff: false,
      startedAt: null,
      endedReason: null,
    });
  },

  async acceptCall() {
    const { callId, callType, status } = store();
    if (!isCallSupported() || !callId) return;
    if (status !== 'incoming') return;

    // Passage immediat en "connexion" : sans cela, deux appuis rapides sur
    // Accepter ouvriraient deux connexions a la salle.
    store().patch({ status: 'connecting' });
    try {
      await ensureCallPermissions(callType === 'video');
    } catch (e: any) {
      getSocket()?.emit('call-reject', { callId });
      finish(e?.message || 'failed');
      return;
    }
    applyAudioRoute(callType);

    const ack = await request('call-accept', { callId });
    if (!ack.ok) {
      finish(ack.error);
      return;
    }
    store().patch({ members: toMembers(ack.participants) });
    armConnectTimer(callId);
    try {
      await connectRoom(callId, callType);
    } catch {
      failEntry(callId, 'failed');
    }
  },

  rejectCall() {
    const { callId } = store();
    if (callId) getSocket()?.emit('call-reject', { callId });
    cleanup();
    store().reset();
  },

  endCall() {
    const { callId, status } = store();
    if (status === 'ended' || status === 'idle') {
      endedTimer = clearTimer(endedTimer);
      store().reset();
      return;
    }
    // Le serveur distingue lui-meme annulation et raccrochage.
    if (callId) getSocket()?.emit('call-end', { callId });
    cleanup();
    store().reset();
  },

  // ---- Evenements serveur ----

  /** Liste des invites mise a jour (arrivee, depart, refus, sonnerie finie). */
  onParticipants(data: { callId?: string; participants?: ServerMember[] }) {
    if (!data?.callId || data.callId !== store().callId) return;
    if (!data.participants) return;
    store().patch({ members: toMembers(data.participants) });
  },

  /** Fin d'appel decidee par le serveur. */
  onCallEnded(data?: { callId?: string; reason?: string | null }) {
    const { callId, status, isCaller } = store();
    if (data?.callId && callId && data.callId !== callId) return;
    // Deja sur l'ecran de fin : un second evenement effacerait le motif.
    if (status === 'ended') return;

    let reason = data?.reason ?? undefined;
    // "Pas de reponse" ne s'adresse qu'a l'appelant d'un appel a deux :
    // ailleurs la sonnerie s'arrete, il n'y a rien a expliquer.
    if (reason === 'timeout' && (!isCaller || status === 'active')) {
      reason = undefined;
    }
    finish(reason);
  },

  /** Ca sonnait chez nous, et l'appel s'est arrete ou a ete pris ailleurs. */
  onRingStopped(data?: { callId?: string }) {
    const { callId, status } = store();
    if (status !== 'incoming') return;
    if (data?.callId && data.callId !== callId) return;
    cleanup();
    store().reset();
  },

  onRoomCallStarted(data: { roomId: string; callId: string; callType: 'audio' | 'video' }) {
    if (!data?.roomId) return;
    store().setRoomCall(data.roomId, {
      callId: data.callId,
      callType: data.callType === 'video' ? 'video' : 'audio',
    });
  },

  onRoomCallEnded(data: { roomId: string; callId: string }) {
    if (!data?.roomId) return;
    if (store().roomCalls[data.roomId]?.callId !== data.callId) return;
    store().setRoomCall(data.roomId, null);
  },

  /** Interroge le serveur sur un appel en cours dans ce salon. */
  async refreshRoomCall(roomId: string) {
    const socket = getSocket();
    if (!socket?.connected) return;
    try {
      const res = await socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('call-room-status', { roomId });
      const call = res?.call;
      store().setRoomCall(
        roomId,
        call
          ? {
              callId: call.callId,
              callType: call.callType === 'video' ? 'video' : 'audio',
            }
          : null,
      );
    } catch {
      // Sans reponse, on garde ce qu'on savait.
    }
  },

  /**
   * Un appel a pu sonner pendant que l'application etait en arriere-plan :
   * le socket etait coupe et l'evenement perdu. A la reconnexion on demande
   * au serveur s'il reste un appel en attente pour nous.
   */
  syncPendingCall() {
    const status = store().status;
    if (status !== 'idle' && status !== 'ended') return;
    getSocket()?.emit('call-sync');
  },

  // ---- Commandes locales ----

  toggleMute() {
    const next = !store().muted;
    store().patch({ muted: next });
    room?.localParticipant.setMicrophoneEnabled(!next).catch(() => undefined);
  },

  toggleCamera() {
    const next = !store().cameraOff;
    store().patch({ cameraOff: next });
    room?.localParticipant
      .setCameraEnabled(!next)
      .then(syncMedia)
      .catch(() => undefined);
  },

  toggleSpeaker() {
    const next = !store().speaker;
    store().patch({ speaker: next });
    void setCallAudioRoute(next);
  },

  switchCamera() {
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(
      LKClient.Track.Source.Camera,
    );
    // Propre a la build WebRTC de React Native : bascule avant/arriere sans
    // republier la piste, donc sans coupure chez les autres.
    (pub?.track?.mediaStreamTrack as any)?._switchCamera?.();
  },
};
