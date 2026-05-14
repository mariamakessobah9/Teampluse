import { getSocket } from '../services/socket';

export interface SendMessageExtras {
  type?: 'text' | 'image' | 'file' | 'voice';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
}

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
    extras?: SendMessageExtras,
  ) => {
    getSocket()?.emit('send-message', {
      roomId,
      content,
      type: extras?.type ?? 'text',
      fileUrl: extras?.fileUrl,
      fileName: extras?.fileName,
      fileSize: extras?.fileSize,
      duration: extras?.duration,
    });
  };

  const sendTyping = (roomId: string, isTyping: boolean) => {
    getSocket()?.emit('typing', { roomId, isTyping });
  };

  const markAsRead = (roomId: string) => {
    getSocket()?.emit('mark-read', { roomId });
  };

  return { joinRoom, leaveRoom, sendMessage, sendTyping, markAsRead };
}
