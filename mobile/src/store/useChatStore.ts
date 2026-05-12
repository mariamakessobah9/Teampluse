import { create } from 'zustand';
import api from '../services/api';
import { ChatRoom, Message } from '../types';

interface ChatState {
  rooms: ChatRoom[];
  activeRoom: ChatRoom | null;
  messages: Record<string, Message[]>; // roomId -> messages

  fetchRooms: () => Promise<void>;
  setActiveRoom: (room: ChatRoom | null) => void;
  fetchMessages: (roomId: string, page?: number) => Promise<void>;
  addMessage: (roomId: string, message: Message) => void;
  updateMessageStatus: (messageId: string, roomId: string, status: string) => void;
  createDirectRoom: (targetUserId: string) => Promise<ChatRoom>;
  createGroupRoom: (name: string, memberIds: string[]) => Promise<ChatRoom>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  activeRoom: null,
  messages: {},

  fetchRooms: async () => {
    const { data } = await api.get('/chat/rooms');
    set({ rooms: data });
  },

  setActiveRoom: (room) => set({ activeRoom: room }),

  fetchMessages: async (roomId, page = 1) => {
    const { data } = await api.get(`/chat/rooms/${roomId}/messages`, {
      params: { page, limit: 50 },
    });
    set((state) => ({
      messages: { ...state.messages, [roomId]: data },
    }));
  },

  addMessage: (roomId, message) => {
    set((state) => {
      const existing = state.messages[roomId] || [];
      // Avoid duplicates
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messages: { ...state.messages, [roomId]: [...existing, message] },
      };
    });
  },

  updateMessageStatus: (messageId, roomId, status) => {
    set((state) => {
      const msgs = state.messages[roomId] || [];
      return {
        messages: {
          ...state.messages,
          [roomId]: msgs.map((m) =>
            m.id === messageId ? { ...m, status: status as Message['status'] } : m,
          ),
        },
      };
    });
  },

  createDirectRoom: async (targetUserId) => {
    const { data } = await api.post('/chat/rooms/direct', { targetUserId });
    const rooms = get().rooms;
    if (!rooms.find((r) => r.id === data.id)) {
      set({ rooms: [data, ...rooms] });
    }
    return data;
  },

  createGroupRoom: async (name, memberIds) => {
    const { data } = await api.post('/chat/rooms/group', { name, memberIds });
    set((state) => ({ rooms: [data, ...state.rooms] }));
    return data;
  },
}));
