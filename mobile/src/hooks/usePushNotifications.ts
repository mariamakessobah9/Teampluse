import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../store/useAuthStore';
import {
  registerForPushNotifications,
  registerPushTokenWithBackend,
} from '../services/notifications';
import { handleNotificationAction } from '../services/notificationTask';
import {
  navigateToCalls,
  navigateToRoom,
} from '../navigation/navigationRef';

const handleNotificationData = (data: unknown) => {
  if (!data || typeof data !== 'object') return;
  const payload = data as { type?: string; roomId?: string };

  // Appel entrant : rien a ouvrir, revenir au premier plan suffit. Le
  // socket se reconnecte et redemande l'appel en attente, ce qui fait
  // remonter l'ecran d'appel tout seul.
  if (payload.type === 'incoming-call') return;
  if (payload.type === 'missed-call') {
    navigateToCalls();
    return;
  }
  if (payload.roomId) {
    navigateToRoom(payload.roomId);
  }
};

const handleResponse = async (
  response: Notifications.NotificationResponse,
) => {
  if (await handleNotificationAction(response)) return;
  handleNotificationData(response.notification.request.content.data);
};

export function usePushNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Register the push token with the backend once authenticated.
  // Unregistration happens inside the logout action while the JWT is valid.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    (async () => {
      const token = await registerForPushNotifications();
      if (cancelled || !token) return;
      await registerPushTokenWithBackend(token);
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Handle taps on notifications (foreground, background, and cold start).
  useEffect(() => {
    const subscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        void handleResponse(response);
      });

    // Demarrage depuis une notification. Seul l'appui simple compte : une
    // action (« Répondre ») a deja ete traitee par la tache de fond, la
    // rejouer enverrait le message une seconde fois. Effacee ensuite pour
    // ne pas rouvrir la conversation au prochain lancement.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (
        response &&
        response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        handleNotificationData(response.notification.request.content.data);
      }
      Notifications.clearLastNotificationResponseAsync().catch(
        () => undefined,
      );
    });

    return () => subscription.remove();
  }, []);
}
