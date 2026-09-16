import api from './api';
import { getSocket } from './socket';
import { useCallStore, CallPeer } from '../store/useCallStore';

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

export const isCallSupported = (): boolean => !!RTC;
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

const store = () => useCallStore.getState();

const newCallId = () =>
  `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function getLocalStream(video: boolean): Promise<any> {
  return RTC.mediaDevices.getUserMedia({
    audio: true,
    video: video ? { facingMode: 'user' } : false,
  });
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
      store().patch({
        remoteStream,
        status: 'active',
        startedAt: store().startedAt ?? Date.now(),
      });
    }
  });

  return connection;
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
}

export const callManager = {
  async startCall(peer: CallPeer, callType: 'audio' | 'video') {
    if (!RTC) throw new Error('Calls are unavailable in this build');
    if (store().status !== 'idle') throw new Error('Already in a call');
    try {
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
      });
      getSocket()?.emit('call-initiate', {
        callId,
        calleeId: peer.id,
        callType,
      });
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
    if (!RTC || store().status !== 'idle') {
      // Busy or unsupported — auto-reject so the caller isn't left hanging.
      getSocket()?.emit('call-reject', { callId: data.callId });
      return;
    }
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
    });
  },

  async acceptCall() {
    const { callId, peer, callType } = store();
    if (!RTC || !callId || !peer) return;
    try {
      const [stream, iceConfig] = await Promise.all([
        getLocalStream(callType === 'video'),
        getIceConfig(),
      ]);
      pc = createPeer(peer.id, callId, iceConfig);
      attachLocalTracks(pc, stream);
      store().patch({
        status: 'connecting',
        localStream: stream,
        startedAt: Date.now(),
      });
      getSocket()?.emit('call-accept', { callId });
    } catch {
      cleanup();
      getSocket()?.emit('call-reject', { callId });
      store().reset();
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
    if (callId) {
      getSocket()?.emit(
        status === 'outgoing' ? 'call-cancel' : 'call-end',
        { callId },
      );
    }
    cleanup();
    store().reset();
  },

  async onCallAccepted() {
    const { callId, peer } = store();
    if (!pc || !callId || !peer) return;
    try {
      store().patch({ status: 'connecting', startedAt: Date.now() });
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      getSocket()?.emit('webrtc-offer', { callId, to: peer.id, sdp: offer });
    } catch {
      callManager.endCall();
    }
  },

  async onWebrtcOffer(data: { callId: string; sdp: any }) {
    const { peer } = store();
    if (!pc || !peer) return;
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
      callManager.endCall();
    }
  },

  async onWebrtcAnswer(data: { sdp: any }) {
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTC.RTCSessionDescription(data.sdp));
      await flushPendingCandidates();
    } catch {
      callManager.endCall();
    }
  },

  async onWebrtcIce(data: { candidate: any }) {
    if (!pc || !data.candidate) return;
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

  onCallEnded() {
    cleanup();
    store().reset();
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

  switchCamera() {
    const { localStream } = store();
    (localStream as any)?.getVideoTracks?.().forEach((t: any) => {
      t._switchCamera?.();
    });
  },
};
