import { create } from 'zustand';

export type CallStatus =
  | 'idle'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'active';

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
  startedAt: number | null;

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
  startedAt: null,
};

export const useCallStore = create<CallState>((set) => ({
  ...initialState,
  patch: (partial) => set(partial),
  reset: () => set(initialState),
}));
