import { create } from 'zustand';

interface BannerState {
  visible: boolean;
  title: string;
  body: string;
  roomId: string | null;
  show: (payload: { title: string; body: string; roomId: string }) => void;
  hide: () => void;
}

export const useBannerStore = create<BannerState>((set) => ({
  visible: false,
  title: '',
  body: '',
  roomId: null,

  show: ({ title, body, roomId }) =>
    set({ visible: true, title, body, roomId }),

  hide: () => set({ visible: false }),
}));
