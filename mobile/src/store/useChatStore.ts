import { create } from 'zustand';
import api from '../services/api';
import { ChatRoom, Message } from '../types';
import { useAuthStore } from './useAuthStore';

interface ChatState {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  messages: Record<string, Message[]>;

  fetchRooms: () => Promise<void>;
  setActiveRoom: (roomId: string | null) => void;
  fetchMessages: (roomId: string, page?: number) => Promise<void>;

  addMessage: (roomId: string, message: Message) => void;
  handleIncomingMessage: (message: Message) => void;
  updateMessageStatus: (messageId: string, roomId: string, status: string) => void;
  markRoomMessagesRead: (roomId: string, readerUserId: string) => void;
  setUserOnline: (userId: string, isOnline: boolean) => void;

  createDirectRoom: (targetUserId: string) => Promise<ChatRoom>;
  createGroupRoom: (name: string, memberIds: string[]) => Promise<ChatRoom>;

  reset: () => void;
}

const sortRoomsByActivity = (rooms: ChatRoom[]): ChatRoom[] =>
  [...rooms].sort((a, b) => {
    const aDate = new Date(a.lastMessage?.createdAt || a.updatedAt).getTime();
    const bDate = new Date(b.lastMessage?.createdAt || b.updatedAt).getTime();
    return bDate - aDate;
  });

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},

  fetchRooms: async () => {
    const { data } = await api.get('/chat/rooms');
    set({ rooms: sortRoomsByActivity(data) });
  },

  setActiveRoom: (roomId) => {
    set({ activeRoomId: roomId });
    if (roomId) {
      set((state) => ({
        rooms: state.rooms.map((r) =>
          r.id === roomId ? { ...r, unreadCount: 0 } : r,
        ),
      }));
    }
  },

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
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messages: { ...state.messages, [roomId]: [...existing, message] },
      };
    });
  },

  handleIncomingMessage: (message) => {
    const { activeRoomId, rooms, messages } = get();
    const roomId = message.chatRoomId;
    const currentUserId = useAuthStore.getState().user?.id;

    const existing = messages[roomId] || [];
    const isDuplicate = existing.some((m) => m.id === message.id);
    const updatedMessages = isDuplicate
      ? messages
      : { ...messages, [roomId]: [...existing, message] };

    const fromSomeoneElse = message.senderId !== currentUserId;
    const isViewing = activeRoomId === roomId;
    const shouldBumpUnread = fromSomeoneElse && !isViewing;

    const roomKnown = rooms.some((r) => r.id === roomId);
    let updatedRooms = roomKnown
      ? rooms.map((r) =>
          r.id === roomId
            ? {
                ...r,
                lastMessage: message,
                unreadCount: shouldBumpUnread
                  ? (r.unreadCount || 0) + 1
                  : r.unreadCount,
              }
            : r,
        )
      : rooms;

    if (roomKnown) updatedRooms = sortRoomsByActivity(updatedRooms);

    set({ messages: updatedMessages, rooms: updatedRooms });

    if (!roomKnown) {
      // brand new conversation: refetch list to get the new room
      get().fetchRooms().catch(() => undefined);
    }
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

  markRoomMessagesRead: (roomId, readerUserId) => {
    set((state) => {
      const msgs = state.messages[roomId] || [];
      return {
        messages: {
          ...state.messages,
          [roomId]: msgs.map((m) =>
            m.senderId !== readerUserId && m.status !== 'read'
              ? { ...m, status: 'read' as Message['status'] }
              : m,
          ),
        },
        rooms: state.rooms.map((r) =>
          r.id === roomId ? { ...r, unreadCount: 0 } : r,
        ),
      };
    });
  },

  setUserOnline: (userId, isOnline) => {
    set((state) => ({
      rooms: state.rooms.map((room) => ({
        ...room,
        members: room.members?.map((m) =>
          m.id === userId ? { ...m, isOnline } : m,
        ),
      })),
    }));
  },

  createDirectRoom: async (targetUserId) => {
    const { data } = await api.post('/chat/rooms/direct', { targetUserId });
    set((state) => {
      const exists = state.rooms.find((r) => r.id === data.id);
      const rooms = exists
        ? state.rooms.map((r) => (r.id === data.id ? data : r))
        : [data, ...state.rooms];
      return { rooms: sortRoomsByActivity(rooms) };
    });
    return data;
  },

  createGroupRoom: async (name, memberIds) => {
    const { data } = await api.post('/chat/rooms/group', { name, memberIds });
    set((state) => ({ rooms: sortRoomsByActivity([data, ...state.rooms]) }));
    return data;
  },

  reset: () => set({ rooms: [], activeRoomId: null, messages: {} }),
}));
