import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../store/useAuthStore';
import {
  registerForPushNotifications,
  registerPushTokenWithBackend,
} from '../services/notifications';
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
        handleNotificationData(
          response.notification.request.content.data,
        );
      });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationData(
          response.notification.request.content.data,
        );
      }
    });

    return () => subscription.remove();
  }, []);
}
