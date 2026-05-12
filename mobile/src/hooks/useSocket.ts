import { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import { useChatStore } from '../store/useChatStore';
import { Message } from '../types';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const addMessage = useChatStore((s) => s.addMessage);

  useEffect(() => {
    const init = async () => {
      const socket = await connectSocket();
      socketRef.current = socket;

      socket.on('new-message', (message: Message) => {
        addMessage(message.chatRoomId, message);
      });

      socket.on('message-delivered', ({ messageId, roomId }) => {
        useChatStore
          .getState()
          .updateMessageStatus(messageId, roomId, 'delivered');
      });

      socket.on('messages-read', ({ roomId, userId }) => {
        const messages = useChatStore.getState().messages[roomId] || [];
        messages.forEach((msg) => {
          if (msg.senderId !== userId && msg.status !== 'read') {
            useChatStore
              .getState()
              .updateMessageStatus(msg.id, roomId, 'read');
          }
        });
      });
    };

    init();

    return () => {
      disconnectSocket();
    };
  }, []);

  const joinRoom = (roomId: string) => {
    getSocket()?.emit('join-room', { roomId });
  };

  const leaveRoom = (roomId: string) => {
    getSocket()?.emit('leave-room', { roomId });
  };

  const sendMessage = (
    roomId: string,
    content: string,
    type = 'text',
    fileUrl?: string,
  ) => {
    getSocket()?.emit('send-message', { roomId, content, type, fileUrl });
  };

  const sendTyping = (roomId: string, isTyping: boolean) => {
    getSocket()?.emit('typing', { roomId, isTyping });
  };

  const markAsRead = (roomId: string) => {
    getSocket()?.emit('mark-read', { roomId });
  };

  return { joinRoom, leaveRoom, sendMessage, sendTyping, markAsRead };
}
