import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';

export const navigationRef =
  createNavigationContainerRef<RootStackParamList>();

export function navigateToRoom(roomId: string) {
  if (!navigationRef.isReady()) return;

  const room = useChatStore.getState().rooms.find((r) => r.id === roomId);
  let roomName = 'Chat';
  if (room) {
    if (room.type === 'group') {
      roomName = room.name || 'Group';
    } else {
      const myId = useAuthStore.getState().user?.id;
      roomName =
        room.members?.find((m) => m.id !== myId)?.name || 'Chat';
    }
  } else {
    // Room not in store yet — refresh in the background so the screen fills in.
    useChatStore.getState().fetchRooms().catch(() => undefined);
  }

  navigationRef.navigate('ChatRoom', { roomId, roomName });
}
