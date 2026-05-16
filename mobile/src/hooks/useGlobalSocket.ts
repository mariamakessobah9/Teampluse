import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../services/socket';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { useBannerStore } from '../store/useBannerStore';
import { setAppBadgeCount } from '../services/notifications';
import { ChatRoom, Message } from '../types';

const TYPING_AUTO_CLEAR_MS = 5000;
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearTypingTimer = (key: string) => {
  const t = typingTimers.get(key);
  if (t) {
    clearTimeout(t);
    typingTimers.delete(key);
  }
};

const messagePreview = (message: Message): string => {
  switch (message.type) {
    case 'image':
      return '📷 Photo';
    case 'file':
      return `📎 ${message.fileName || 'Document'}`;
    case 'voice':
      return '🎤 Voice message';
    default:
      return message.content || '';
  }
};

export function useGlobalSocket() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return;
    }

    let cancelled = false;

    (async () => {
      const socket = await connectSocket();
      if (cancelled) {
        disconnectSocket();
        return;
      }

      socket.on('new-message', (message: Message) => {
        const chat = useChatStore.getState();
        chat.handleIncomingMessage(message);

        const myId = useAuthStore.getState().user?.id;
        if (message.senderId === myId) return;
        if (chat.activeRoomId === message.chatRoomId) return;

        // App is open but the user isn't in this room — show in-app banner.
        const room = chat.rooms.find((r) => r.id === message.chatRoomId);
        const senderName = message.sender?.name || 'New message';
        const isGroup = room?.type === 'group';
        useBannerStore.getState().show({
          title: isGroup ? room?.name || 'Group' : senderName,
          body: isGroup
            ? `${senderName}: ${messagePreview(message)}`
            : messagePreview(message),
          roomId: message.chatRoomId,
        });
      });

      socket.on('message-delivered', ({ messageId, roomId }) => {
        useChatStore.getState().updateMessageStatus(messageId, roomId, 'delivered');
      });

      socket.on('messages-read', ({ roomId, userId }) => {
        useChatStore.getState().markRoomMessagesRead(roomId, userId);
      });

      socket.on('user-online', ({ userId }) => {
        useChatStore.getState().setUserOnline(userId, true);
      });

      socket.on('user-offline', ({ userId }) => {
        useChatStore.getState().setUserOnline(userId, false);
      });

      socket.on(
        'user-typing',
        ({
          userId,
          roomId,
          isTyping,
        }: {
          userId: string;
          roomId: string;
          isTyping: boolean;
        }) => {
          const key = `${roomId}:${userId}`;
          clearTypingTimer(key);
          useChatStore.getState().setTyping(roomId, userId, isTyping);
          if (isTyping) {
            typingTimers.set(
              key,
              setTimeout(() => {
                useChatStore.getState().setTyping(roomId, userId, false);
                typingTimers.delete(key);
              }, TYPING_AUTO_CLEAR_MS),
            );
          }
        },
      );

      socket.on('room-created', (room: ChatRoom) => {
        useChatStore.getState().upsertRoom(room);
      });

      socket.on('room-updated', (room: ChatRoom) => {
        useChatStore.getState().upsertRoom(room);
      });

      socket.on('room-deleted', ({ roomId }: { roomId: string }) => {
        useChatStore.getState().removeRoom(roomId);
      });

      socket.on('removed-from-room', ({ roomId }: { roomId: string }) => {
        useChatStore.getState().removeRoom(roomId);
      });
    })();

    return () => {
      cancelled = true;
      typingTimers.forEach((t) => clearTimeout(t));
      typingTimers.clear();
      disconnectSocket();
    };
  }, [isAuthenticated]);

  // Keep the app icon badge in sync with total unread messages.
  useEffect(() => {
    if (!isAuthenticated) {
      setAppBadgeCount(0);
      return;
    }
    let lastBadge = -1;
    const sync = (rooms: ChatRoom[]) => {
      const total = rooms.reduce(
        (sum, r) => sum + (r.unreadCount || 0),
        0,
      );
      if (total !== lastBadge) {
        lastBadge = total;
        setAppBadgeCount(total);
      }
    };
    sync(useChatStore.getState().rooms);
    const unsub = useChatStore.subscribe((state) => sync(state.rooms));
    return unsub;
  }, [isAuthenticated]);
}
