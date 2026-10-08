import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import {
  MARK_READ_ACTION_ID,
  REPLY_ACTION_ID,
  dismissRoomNotifications,
  markRoomReadFromNotification,
  replyFromNotification,
} from './notifications';

/**
 * Tache de fond des notifications. Sur Android, elle tourne aussi quand on
 * appuie sur « Répondre » ou « Marquer comme lu » alors que l'application
 * est fermee : sans elle, ces actions seraient perdues.
 *
 * Doit etre definie au chargement du bundle (cf. index.ts), avant tout
 * composant : Android relance le JS sans interface pour l'executer.
 */
export const BACKGROUND_NOTIFICATION_TASK = 'teampulse-notification-actions';

// L'ecouteur de l'application et la tache de fond peuvent recevoir la meme
// action quand l'application est en arriere-plan : un seul envoi.
const handledActions = new Set<string>();

/**
 * Traite « Répondre » / « Marquer comme lu ». Renvoie `false` pour un
 * simple appui sur la notification, laisse a l'appelant (navigation).
 */
export async function handleNotificationAction(
  response: Notifications.NotificationResponse,
): Promise<boolean> {
  const { notification, actionIdentifier, userText } = response;
  if (
    actionIdentifier !== REPLY_ACTION_ID &&
    actionIdentifier !== MARK_READ_ACTION_ID
  ) {
    return false;
  }

  const key = `${notification.request.identifier}:${actionIdentifier}`;
  if (handledActions.has(key)) return true;
  handledActions.add(key);

  const roomId = (
    notification.request.content.data as { roomId?: string } | undefined
  )?.roomId;
  if (!roomId) return true;

  try {
    if (actionIdentifier === REPLY_ACTION_ID) {
      await replyFromNotification(roomId, userText ?? '');
    } else {
      await markRoomReadFromNotification(roomId);
    }
  } catch (e) {
    console.warn(`[notifications] ${actionIdentifier} failed:`, e);
  }
  // Repondre, c'est avoir lu : la conversation quitte le volet.
  await dismissRoomNotifications(roomId);
  return true;
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error }) => {
    if (error || !data || !('actionIdentifier' in data)) return;
    await handleNotificationAction(data);
  },
);

Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((e) =>
  console.warn('[notifications] could not register background task:', e),
);
