import { create } from 'zustand';
import api from '../services/api';
import { ChatRoom, Message } from '../types';
import { useAuthStore } from './useAuthStore';

interface ChatState {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  messages: Record<string, Message[]>;
  typingByRoom: Record<string, Record<string, true>>;

  fetchRooms: () => Promise<void>;
  setActiveRoom: (roomId: string | null) => void;
  fetchMessages: (roomId: string, page?: number) => Promise<void>;

  addMessage: (roomId: string, message: Message) => void;
  handleIncomingMessage: (message: Message) => void;
  updateMessageStatus: (messageId: string, roomId: string, status: string) => void;
  markRoomMessagesRead: (roomId: string, readerUserId: string) => void;
  setUserOnline: (userId: string, isOnline: boolean) => void;
  setTyping: (roomId: string, userId: string, isTyping: boolean) => void;

  createDirectRoom: (targetUserId: string) => Promise<ChatRoom>;
  createGroupRoom: (name: string, memberIds: string[]) => Promise<ChatRoom>;

  updateGroup: (
    roomId: string,
    payload: { name?: string; avatar?: string | null },
  ) => Promise<ChatRoom>;
  addGroupMembers: (roomId: string, memberIds: string[]) => Promise<ChatRoom>;
  removeGroupMember: (roomId: string, userId: string) => Promise<ChatRoom>;
  transferGroupAdmin: (roomId: string, newAdminId: string) => Promise<ChatRoom>;
  leaveGroup: (roomId: string) => Promise<void>;

  upsertRoom: (room: ChatRoom) => void;
  removeRoom: (roomId: string) => void;

  pinRoom: (roomId: string) => Promise<void>;
  unpinRoom: (roomId: string) => Promise<void>;

  reset: () => void;
}

const dedupById = <T extends { id: string }>(items: T[] | undefined): T[] => {
  if (!items) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
};

const normalizeRoom = (room: ChatRoom): ChatRoom => ({
  ...room,
  members: dedupById(room.members),
});

const sortRoomsByActivity = (rooms: ChatRoom[]): ChatRoom[] =>
  dedupById(rooms)
    .map(normalizeRoom)
    .sort((a, b) => {
      if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
      const aDate = new Date(a.lastMessage?.createdAt || a.updatedAt).getTime();
      const bDate = new Date(b.lastMessage?.createdAt || b.updatedAt).getTime();
      return bDate - aDate;
    });

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
  typingByRoom: {},

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

  setTyping: (roomId, userId, isTyping) => {
    set((state) => {
      const room = state.typingByRoom[roomId];
      if (isTyping) {
        if (room && room[userId]) return state;
        return {
          typingByRoom: {
            ...state.typingByRoom,
            [roomId]: { ...(room || {}), [userId]: true },
          },
        };
      }
      if (!room || !room[userId]) return state;
      const { [userId]: _removed, ...rest } = room;
      const nextRoom = Object.keys(rest).length > 0 ? rest : undefined;
      const next = { ...state.typingByRoom };
      if (nextRoom) next[roomId] = nextRoom;
      else delete next[roomId];
      return { typingByRoom: next };
    });
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
    get().upsertRoom(data);
    return data;
  },

  updateGroup: async (roomId, payload) => {
    const { data } = await api.patch(`/chat/rooms/${roomId}`, payload);
    get().upsertRoom(data);
    return data;
  },

  addGroupMembers: async (roomId, memberIds) => {
    const { data } = await api.post(`/chat/rooms/${roomId}/members`, {
      memberIds,
    });
    get().upsertRoom(data);
    return data;
  },

  removeGroupMember: async (roomId, userId) => {
    const { data } = await api.delete(
      `/chat/rooms/${roomId}/members/${userId}`,
    );
    get().upsertRoom(data);
    return data;
  },

  transferGroupAdmin: async (roomId, newAdminId) => {
    const { data } = await api.post(`/chat/rooms/${roomId}/transfer-admin`, {
      newAdminId,
    });
    get().upsertRoom(data);
    return data;
  },

  leaveGroup: async (roomId) => {
    await api.post(`/chat/rooms/${roomId}/leave`);
    get().removeRoom(roomId);
  },

  upsertRoom: (room) => {
    set((state) => {
      const existing = state.rooms.find((r) => r.id === room.id);
      const next = existing
        ? state.rooms.map((r) =>
            r.id === room.id
              ? {
                  ...r,
                  ...room,
                  lastMessage: room.lastMessage ?? r.lastMessage,
                  unreadCount: room.unreadCount ?? r.unreadCount,
                  isPinned: room.isPinned ?? r.isPinned,
                }
              : r,
          )
        : [room, ...state.rooms];
      return { rooms: sortRoomsByActivity(next) };
    });
  },

  pinRoom: async (roomId) => {
    const setPinned = (value: boolean) =>
      set((state) => ({
        rooms: sortRoomsByActivity(
          state.rooms.map((r) =>
            r.id === roomId ? { ...r, isPinned: value } : r,
          ),
        ),
      }));
    setPinned(true);
    try {
      await api.post(`/chat/rooms/${roomId}/pin`);
    } catch {
      setPinned(false);
    }
  },

  unpinRoom: async (roomId) => {
    const setPinned = (value: boolean) =>
      set((state) => ({
        rooms: sortRoomsByActivity(
          state.rooms.map((r) =>
            r.id === roomId ? { ...r, isPinned: value } : r,
          ),
        ),
      }));
    setPinned(false);
    try {
      await api.delete(`/chat/rooms/${roomId}/pin`);
    } catch {
      setPinned(true);
    }
  },

  removeRoom: (roomId) => {
    set((state) => {
      const { [roomId]: _removed, ...remainingMessages } = state.messages;
      const { [roomId]: _typing, ...remainingTyping } = state.typingByRoom;
      return {
        rooms: state.rooms.filter((r) => r.id !== roomId),
        messages: remainingMessages,
        typingByRoom: remainingTyping,
        activeRoomId:
          state.activeRoomId === roomId ? null : state.activeRoomId,
      };
    });
  },

  reset: () =>
    set({ rooms: [], activeRoomId: null, messages: {}, typingByRoom: {} }),
}));
