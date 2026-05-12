import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../services/socket';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { Message } from '../types';

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
    })();

    return () => {
      cancelled = true;
      disconnectSocket();
    };
  }, [isAuthenticated]);
}
