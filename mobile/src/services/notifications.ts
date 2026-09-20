import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';
import { useCallStore } from '../store/useCallStore';

/** Canal Android des appels : sonnerie et priorite maximale. */
export const CALL_CHANNEL_ID = 'calls';

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
      if (ringing) {
        return {
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }
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
