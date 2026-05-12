import { getSocket } from '../services/socket';

export function useSocket() {
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
