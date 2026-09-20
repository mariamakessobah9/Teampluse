import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../services/socket';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { useBannerStore } from '../store/useBannerStore';
import { setAppBadgeCount } from '../services/notifications';
import { callManager } from '../services/callManager';
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

      socket.on(
        'message-deleted',
        ({ roomId, messageId }: { roomId: string; messageId: string }) => {
          useChatStore.getState().markMessageDeleted(roomId, messageId);
        },
      );

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

      // ---- WebRTC call signaling ----
      // Un appel a pu sonner pendant que l'application dormait en
      // arriere-plan, socket coupe : a chaque (re)connexion on redemande au
      // serveur s'il reste un appel en attente.
      socket.on('connect', () => {
        callManager.syncPendingCall();
      });
      socket.on('incoming-call', (data: any) => {
        callManager.receiveIncomingCall(data);
      });
      socket.on('call-accepted', (data: any) => {
        callManager.onCallAccepted(data);
      });
      socket.on('call-rejected', (data: any) => {
        callManager.onCallEnded({
          callId: data?.callId,
          reason: data?.busy ? 'busy' : 'rejected',
        });
      });
      socket.on('call-cancelled', (data: any) => {
        // L'appelant a raccroche avant qu'on decroche : rien a expliquer,
        // la sonnerie s'arrete simplement.
        callManager.onCallEnded({ callId: data?.callId });
      });
      socket.on('call-ended', (data: any) => {
        callManager.onCallEnded({ callId: data?.callId });
      });
      socket.on('call-timeout', (data: any) => {
        callManager.onCallEnded({ callId: data?.callId, reason: 'timeout' });
      });
      socket.on('call-unavailable', (data: any) => {
        callManager.onCallEnded({
          callId: data?.callId,
          reason: 'unavailable',
        });
      });
      socket.on('webrtc-offer', (data: any) => {
        callManager.onWebrtcOffer(data);
      });
      socket.on('webrtc-answer', (data: any) => {
        callManager.onWebrtcAnswer(data);
      });
      socket.on('webrtc-ice', (data: any) => {
        callManager.onWebrtcIce(data);
      });

      // Le socket a pu se connecter avant que l'ecouteur ci-dessus existe.
      if (socket.connected) callManager.syncPendingCall();
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
