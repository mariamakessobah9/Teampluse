import api from './api';
import { getSocket } from './socket';
import { useCallStore, CallPeer } from '../store/useCallStore';
import { ensureCallPermissions } from './mediaPermissions';
import { releaseCallAudio, setCallAudioRoute } from './callAudio';

// react-native-webrtc ships native code. Require it defensively so the JS
// bundle still runs on a build that doesn't yet include the native module
// (calls simply stay unavailable until the app is rebuilt).
let RTC: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RTC = require('react-native-webrtc');
} catch {
  RTC = null;
}

export const isCallSupported = (): boolean => !!RTC?.RTCPeerConnection;
export const getRTCView = (): any => RTC?.RTCView ?? null;

// Repli si l'API est injoignable : STUN seul permet l'appel sur la plupart
// des reseaux, mais echoue derriere un NAT symetrique — d'ou le TURN servi
// par le backend.
const FALLBACK_ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const ICE_CACHE_MS = 10 * 60 * 1000;
let iceCache: { config: any; expiresAt: number } | null = null;

/** Au-dela, un appel qui sonne dans le vide est classe sans reponse. */
const RING_TIMEOUT_MS = 45_000;
/** Delai au-dela duquel une negociation qui n'aboutit pas est abandonnee. */
const CONNECT_TIMEOUT_MS = 30_000;
/** Duree d'affichage du motif de fin avant de refermer l'ecran d'appel. */
const ENDED_DISPLAY_MS = 2200;

export const CALL_END_REASONS = {
  unavailable: "Cette personne n'est pas joignable.",
  rejected: 'Appel refusé.',
  timeout: 'Pas de réponse.',
  busy: 'Cette personne est déjà en appel.',
  failed: "Connexion impossible. Vérifiez votre réseau.",
  ended: 'Appel terminé.',
} as const;

export type CallEndReason = keyof typeof CALL_END_REASONS;

/**
 * La config ICE vient du serveur : les identifiants TURN tournent et sont
 * ephemeres, les figer dans le bundle imposerait une publication Play Store
 * a chaque rotation.
 */
async function getIceConfig(): Promise<any> {
  if (iceCache && iceCache.expiresAt > Date.now()) return iceCache.config;
  try {
    const { data } = await api.get('/calls/ice-servers');
    if (data?.iceServers?.length) {
      iceCache = { config: data, expiresAt: Date.now() + ICE_CACHE_MS };
      return data;
    }
  } catch {
    // Reseau ou serveur indisponible : mieux vaut tenter l'appel en STUN
    // seul que de le refuser d'emblee.
  }
  return FALLBACK_ICE;
}

let pc: any = null;
let pendingCandidates: any[] = [];
let ringTimer: ReturnType<typeof setTimeout> | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let endedTimer: ReturnType<typeof setTimeout> | null = null;

const store = () => useCallStore.getState();

const newCallId = () =>
  `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    throw new Error(
      'Pas de connexion au serveur. Réessayez dans un instant.',
    );
  }
  return socket;
}

async function getLocalStream(video: boolean): Promise<any> {
  await ensureCallPermissions(video);
  try {
    return await RTC.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { facingMode: 'user' } : false,
    });
  } catch {
    throw new Error(
      video
        ? "Impossible d'accéder à la caméra ou au micro."
        : "Impossible d'accéder au micro.",
    );
  }
}

function createPeer(peerId: string, callId: string, iceConfig: any): any {
  const connection = new RTC.RTCPeerConnection(iceConfig);

  connection.addEventListener('icecandidate', (event: any) => {
    if (event.candidate) {
      getSocket()?.emit('webrtc-ice', {
        callId,
        to: peerId,
        candidate: event.candidate,
      });
    }
  });

  connection.addEventListener('track', (event: any) => {
    const remoteStream = event.streams?.[0];
    if (remoteStream) {
      store().patch({ remoteStream });
      markConnected();
    }
  });

  // Sans ce suivi, un appel dont la negociation echoue reste bloque sur
  // "Connexion..." indefiniment : rien ne revient jamais cote interface.
  const onStateChange = () => {
    const state = connection.connectionState ?? connection.iceConnectionState;
    if (state === 'connected' || state === 'completed') {
      markConnected();
    } else if (state === 'failed') {
      finish('failed');
    }
  };
  connection.addEventListener('connectionstatechange', onStateChange);
  connection.addEventListener('iceconnectionstatechange', onStateChange);

  return connection;
}

function markConnected() {
  const { status, startedAt } = store();
  if (status !== 'connecting' && status !== 'outgoing') return;
  connectTimer = clearTimer(connectTimer);
  ringTimer = clearTimer(ringTimer);
  store().patch({ status: 'active', startedAt: startedAt ?? Date.now() });
}

function attachLocalTracks(connection: any, stream: any) {
  stream.getTracks().forEach((track: any) => {
    connection.addTrack(track, stream);
  });
}

async function flushPendingCandidates() {
  if (!pc) return;
  for (const candidate of pendingCandidates) {
    try {
      await pc.addIceCandidate(new RTC.RTCIceCandidate(candidate));
    } catch {
      // ignore malformed/late candidates
    }
  }
  pendingCandidates = [];
}

function cleanup() {
  pendingCandidates = [];
  ringTimer = clearTimer(ringTimer);
  connectTimer = clearTimer(connectTimer);
  const { localStream, remoteStream } = store();
  (localStream as any)?.getTracks?.().forEach((t: any) => t.stop());
  (remoteStream as any)?.getTracks?.().forEach((t: any) => t.stop());
  if (pc) {
    try {
      pc.close();
    } catch {
      // ignore
    }
    pc = null;
  }
  void releaseCallAudio();
}

/**
 * Termine l'appel en cours en affichant brievement pourquoi. `reason`
 * omise = raccrochage normal, l'ecran se referme aussitot.
 */
function finish(reason?: CallEndReason) {
  if (store().status === 'idle') return;
  cleanup();
  endedTimer = clearTimer(endedTimer);

  if (!reason) {
    store().reset();
    return;
  }

  store().patch({
    status: 'ended',
    endedReason: CALL_END_REASONS[reason],
    localStream: null,
    remoteStream: null,
  });
  endedTimer = setTimeout(() => {
    endedTimer = null;
    if (store().status === 'ended') store().reset();
  }, ENDED_DISPLAY_MS);
}

/** Applique la sortie audio adaptee au type d'appel. */
function applyAudioRoute(callType: 'audio' | 'video') {
  const speaker = callType === 'video';
  store().patch({ speaker });
  void setCallAudioRoute(speaker);
}

export const callManager = {
  async startCall(peer: CallPeer, callType: 'audio' | 'video') {
    if (!isCallSupported()) {
      throw new Error(
        "Les appels ne sont pas disponibles dans cette version de l'application.",
      );
    }
    const current = store().status;
    if (current !== 'idle' && current !== 'ended') {
      throw new Error('Un appel est déjà en cours.');
    }
    // Un ecran de fin encore affiche ne doit pas bloquer un nouvel appel.
    if (current === 'ended') {
      endedTimer = clearTimer(endedTimer);
      store().reset();
    }

    try {
      const socket = requireSocket();
      const callId = newCallId();
      const [stream, iceConfig] = await Promise.all([
        getLocalStream(callType === 'video'),
        getIceConfig(),
      ]);
      pc = createPeer(peer.id, callId, iceConfig);
      attachLocalTracks(pc, stream);
      store().patch({
        status: 'outgoing',
        callId,
        callType,
        peer,
        isCaller: true,
        localStream: stream,
        remoteStream: null,
        muted: false,
        cameraOff: false,
        startedAt: null,
        endedReason: null,
      });
      applyAudioRoute(callType);
      socket.emit('call-initiate', {
        callId,
        calleeId: peer.id,
        callType,
      });

      // Filet cote client : si le serveur ne repond jamais (instance
      // redemarree, evenement perdu), l'appel ne sonne pas eternellement.
      ringTimer = clearTimer(ringTimer);
      ringTimer = setTimeout(() => {
        ringTimer = null;
        if (store().status !== 'outgoing') return;
        getSocket()?.emit('call-cancel', { callId });
        finish('timeout');
      }, RING_TIMEOUT_MS + 5_000);
    } catch (e) {
      cleanup();
      store().reset();
      throw e;
    }
  },

  receiveIncomingCall(data: {
    callId: string;
    callType: 'audio' | 'video';
    caller: CallPeer;
  }) {
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
    store().patch({
      status: 'incoming',
      callId: data.callId,
      callType: data.callType,
      peer: data.caller,
      isCaller: false,
      remoteStream: null,
      localStream: null,
      muted: false,
      cameraOff: false,
      startedAt: null,
      endedReason: null,
    });
  },

  async acceptCall() {
    const { callId, peer, callType, status } = store();
    if (!isCallSupported() || !callId || !peer) return;
    if (status !== 'incoming') return;

    // Passage immediat en "connexion" : sans cela, deux appuis rapides sur
    // Accepter creeraient deux PeerConnection.
    store().patch({ status: 'connecting' });
    try {
      const socket = requireSocket();
      const [stream, iceConfig] = await Promise.all([
        getLocalStream(callType === 'video'),
        getIceConfig(),
      ]);
      pc = createPeer(peer.id, callId, iceConfig);
      attachLocalTracks(pc, stream);
      store().patch({ localStream: stream });
      applyAudioRoute(callType);
      socket.emit('call-accept', { callId });

      connectTimer = clearTimer(connectTimer);
      connectTimer = setTimeout(() => {
        connectTimer = null;
        if (store().status === 'connecting') {
          getSocket()?.emit('call-end', { callId });
          finish('failed');
        }
      }, CONNECT_TIMEOUT_MS);
    } catch (e: any) {
      getSocket()?.emit('call-reject', { callId });
      cleanup();
      store().patch({
        status: 'ended',
        endedReason: e?.message || CALL_END_REASONS.failed,
      });
      endedTimer = clearTimer(endedTimer);
      endedTimer = setTimeout(() => {
        endedTimer = null;
        if (store().status === 'ended') store().reset();
      }, ENDED_DISPLAY_MS);
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
    if (callId) {
      getSocket()?.emit(
        status === 'outgoing' ? 'call-cancel' : 'call-end',
        { callId },
      );
    }
    cleanup();
    store().reset();
  },

  async onCallAccepted(data?: { callId?: string }) {
    const { callId, peer } = store();
    if (!pc || !callId || !peer) return;
    if (data?.callId && data.callId !== callId) return;
    try {
      ringTimer = clearTimer(ringTimer);
      store().patch({ status: 'connecting' });
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      getSocket()?.emit('webrtc-offer', { callId, to: peer.id, sdp: offer });

      connectTimer = clearTimer(connectTimer);
      connectTimer = setTimeout(() => {
        connectTimer = null;
        if (store().status === 'connecting') {
          getSocket()?.emit('call-end', { callId });
          finish('failed');
        }
      }, CONNECT_TIMEOUT_MS);
    } catch {
      getSocket()?.emit('call-end', { callId });
      finish('failed');
    }
  },

  async onWebrtcOffer(data: { callId: string; sdp: any }) {
    const { peer, callId } = store();
    if (!pc || !peer) return;
    if (data.callId !== callId) return;
    try {
      await pc.setRemoteDescription(new RTC.RTCSessionDescription(data.sdp));
      await flushPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      getSocket()?.emit('webrtc-answer', {
        callId: data.callId,
        to: peer.id,
        sdp: answer,
      });
    } catch {
      getSocket()?.emit('call-end', { callId });
      finish('failed');
    }
  },

  async onWebrtcAnswer(data: { callId?: string; sdp: any }) {
    if (!pc) return;
    if (data.callId && data.callId !== store().callId) return;
    try {
      await pc.setRemoteDescription(new RTC.RTCSessionDescription(data.sdp));
      await flushPendingCandidates();
    } catch {
      getSocket()?.emit('call-end', { callId: store().callId });
      finish('failed');
    }
  },

  async onWebrtcIce(data: { callId?: string; candidate: any }) {
    if (!pc || !data.candidate) return;
    if (data.callId && data.callId !== store().callId) return;
    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTC.RTCIceCandidate(data.candidate));
      } catch {
        // ignore
      }
    } else {
      pendingCandidates.push(data.candidate);
    }
  },

  /** Fin signalee par le serveur ou par le correspondant. */
  onCallEnded(data?: { callId?: string; reason?: CallEndReason }) {
    if (data?.callId && store().callId && data.callId !== store().callId) {
      return;
    }
    // "Pas de reponse" ne s'adresse qu'a l'appelant : cote destinataire,
    // la sonnerie s'arrete, il n'y a rien a lui expliquer.
    const reason =
      data?.reason === 'timeout' && !store().isCaller
        ? undefined
        : data?.reason;
    finish(reason);
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

  toggleMute() {
    const { localStream, muted } = store();
    const next = !muted;
    (localStream as any)?.getAudioTracks?.().forEach((t: any) => {
      t.enabled = !next;
    });
    store().patch({ muted: next });
  },

  toggleCamera() {
    const { localStream, cameraOff } = store();
    const next = !cameraOff;
    (localStream as any)?.getVideoTracks?.().forEach((t: any) => {
      t.enabled = !next;
    });
    store().patch({ cameraOff: next });
  },

  toggleSpeaker() {
    const next = !store().speaker;
    store().patch({ speaker: next });
    void setCallAudioRoute(next);
  },

  switchCamera() {
    const { localStream } = store();
    (localStream as any)?.getVideoTracks?.().forEach((t: any) => {
      t._switchCamera?.();
    });
  },
};
