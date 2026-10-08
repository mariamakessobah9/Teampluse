import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import api from './api';
import { getSocket } from './socket';
import { useCallStore } from '../store/useCallStore';
import { useChatStore } from '../store/useChatStore';

/** Canal Android des appels : sonnerie et priorite maximale. */
export const CALL_CHANNEL_ID = 'calls';

/** Categorie des messages : « Répondre » et « Marquer comme lu ». */
export const MESSAGE_CATEGORY_ID = 'message';
export const REPLY_ACTION_ID = 'reply';
export const MARK_READ_ACTION_ID = 'mark-read';

const HIDDEN = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
};

// How notifications behave while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as
      | { type?: string; callId?: string }
      | undefined;

    // L'appel sonne deja dans l'application : la notification poussee ne
    // sert qu'a reveiller un telephone en veille, l'afficher en double
    // par-dessus l'ecran d'appel n'apporte rien.
    if (data?.type === 'incoming-call') {
      const call = useCallStore.getState();
      const ringing =
        call.status !== 'idle' &&
        (!data.callId || data.callId === call.callId);
      if (ringing) return HIDDEN;
    }

    // Application ouverte et socket connecte : le message arrive aussi par
    // le socket, qui affiche deja la banniere interne (ou rien si la
    // conversation est a l'ecran). Pas de doublon systeme, comme WhatsApp.
    if (
      data?.type === 'message' &&
      AppState.currentState === 'active' &&
      getSocket()?.connected
    ) {
      return HIDDEN;
    }
    const roomId = (data as { roomId?: string } | undefined)?.roomId;
    if (
      data?.type === 'message' &&
      AppState.currentState === 'active' &&
      roomId &&
      useChatStore.getState().activeRoomId === roomId
    ) {
      return HIDDEN;
    }

    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});

const resolveProjectId = (): string | undefined =>
  Constants.expoConfig?.extra?.eas?.projectId ??
  (Constants as any).easConfig?.projectId;

// The push token for this device, kept so logout can unregister it.
let activePushToken: string | null = null;

/**
 * Requests permission and returns the Expo push token, or null if
 * unavailable (simulator, permission denied, no EAS project id).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#16a34a',
    });
    await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
      name: 'Appels',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 700, 900, 700, 900],
      lightColor: '#16a34a',
      // Contourne le mode silencieux : un appel doit reveiller, pas
      // attendre sagement dans le volet des notifications.
      bypassDnd: true,
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  await registerNotificationCategories();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  try {
    const projectId = resolveProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    activePushToken = tokenResponse.data;
    return activePushToken;
  } catch (e) {
    console.warn('[notifications] could not get push token:', e);
    return null;
  }
}

export async function registerPushTokenWithBackend(
  token: string,
): Promise<void> {
  try {
    await api.post('/users/push-token', { token });
  } catch (e) {
    console.warn('[notifications] failed to register token:', e);
  }
}

/**
 * Removes this device's token from the backend. Must run while the JWT
 * is still valid, i.e. before clearing auth on logout.
 */
export async function unregisterActivePushToken(): Promise<void> {
  if (!activePushToken) return;
  try {
    await api.delete('/users/push-token', {
      data: { token: activePushToken },
    });
  } catch (e) {
    console.warn('[notifications] failed to unregister token:', e);
  } finally {
    activePushToken = null;
  }
}

export async function setAppBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // badge not supported on this platform — ignore
  }
}

/** Actions affichees sous une notification de message. */
async function registerNotificationCategories(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(MESSAGE_CATEGORY_ID, [
      {
        identifier: REPLY_ACTION_ID,
        buttonTitle: 'Répondre',
        textInput: {
          submitButtonTitle: 'Envoyer',
          placeholder: 'Message',
        },
        options: { opensAppToForeground: false },
      },
      {
        identifier: MARK_READ_ACTION_ID,
        buttonTitle: 'Marquer comme lu',
        options: { opensAppToForeground: false },
      },
    ]);
  } catch (e) {
    console.warn('[notifications] could not register categories:', e);
  }
}

/**
 * Retire du volet les notifications d'une conversation, une fois celle-ci
 * ouverte ou lue ailleurs.
 */
export async function dismissRoomNotifications(roomId: string): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter(
          (n) =>
            (n.request.content.data as { roomId?: string } | undefined)
              ?.roomId === roomId,
        )
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch {
    // volet inaccessible sur cette plateforme — ignorer
  }
}

/** « Répondre » depuis la notification, sans ouvrir l'application. */
export async function replyFromNotification(
  roomId: string,
  content: string,
): Promise<void> {
  const text = content.trim();
  if (!text) return;
  await api.post(`/chat/rooms/${roomId}/messages`, { content: text });
}

/** « Marquer comme lu » depuis la notification. */
export async function markRoomReadFromNotification(
  roomId: string,
): Promise<void> {
  await api.post(`/chat/rooms/${roomId}/read`);
}
