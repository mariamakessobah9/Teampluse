import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';

export const navigationRef =
  createNavigationContainerRef<RootStackParamList>();

// Appui sur une notification au demarrage : la navigation principale n'est
// pas encore montee (chargement, session en cours de restauration). La
// destination attend ici au lieu d'etre perdue.
let pendingNavigation: (() => void) | null = null;

const mainReady = () =>
  navigationRef.isReady() &&
  !!navigationRef.getRootState()?.routeNames?.includes('ChatRoom');

const navigateWhenReady = (go: () => void) => {
  if (mainReady()) {
    pendingNavigation = null;
    go();
  } else {
    pendingNavigation = go;
  }
};

/** Appele par la navigation principale une fois montee. */
export function flushPendingNavigation() {
  const go = pendingNavigation;
  if (!go || !mainReady()) return;
  pendingNavigation = null;
  go();
}

/** Ouvre l'onglet Appels (notification d'appel manque). */
export function navigateToCalls() {
  navigateWhenReady(goToCalls);
}

function goToCalls() {
  // `Main` porte le navigateur d'onglets : la cible reelle est imbriquee,
  // ce que le typage du stack racine ne decrit pas.
  (navigationRef.navigate as (name: string, params?: object) => void)(
    'Main',
    { screen: 'Calls' },
  );
}

export function navigateToRoom(roomId: string) {
  navigateWhenReady(() => goToRoom(roomId));
}

function goToRoom(roomId: string) {

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
