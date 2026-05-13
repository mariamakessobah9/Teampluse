import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../services/socket';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { Message } from '../types';

const TYPING_AUTO_CLEAR_MS = 5000;
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearTypingTimer = (key: string) => {
  const t = typingTimers.get(key);
  if (t) {
    clearTimeout(t);
    typingTimers.delete(key);
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
        useChatStore.getState().handleIncomingMessage(message);
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
    })();

    return () => {
      cancelled = true;
      typingTimers.forEach((t) => clearTimeout(t));
      typingTimers.clear();
      disconnectSocket();
    };
  }, [isAuthenticated]);
}
