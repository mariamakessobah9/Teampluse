import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';

export const navigationRef =
  createNavigationContainerRef<RootStackParamList>();

/** Ouvre l'onglet Appels (notification d'appel manque). */
export function navigateToCalls() {
  if (!navigationRef.isReady()) return;
  // `Main` porte le navigateur d'onglets : la cible reelle est imbriquee,
  // ce que le typage du stack racine ne decrit pas.
  (navigationRef.navigate as (name: string, params?: object) => void)(
    'Main',
    { screen: 'Calls' },
  );
}

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
