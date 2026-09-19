/**
 * Substitut d'`expo-server-sdk` pour les tests.
 *
 * Le paquet reel est publie en ESM pur (`"type": "module"`), que Jest ne sait
 * pas charger dans cette configuration CommonJS. Les notifications push ne
 * sont de toute facon pas l'objet de ces tests : on remplace le client par
 * une coquille inerte plutot que d'alourdir la chaine de compilation.
 */
export interface ExpoPushMessage {
  to: string | string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: string | null;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export class Expo {
  /** Accepte le format de jeton Expo, comme la bibliotheque d'origine. */
  static isExpoPushToken(token: string): boolean {
    return (
      typeof token === 'string' &&
      (token.startsWith('ExponentPushToken[') ||
        token.startsWith('ExpoPushToken['))
    );
  }

  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][] {
    return messages.length ? [messages] : [];
  }

  async sendPushNotificationsAsync(
    messages: ExpoPushMessage[],
  ): Promise<ExpoPushTicket[]> {
    return messages.map(() => ({ status: 'ok' as const }));
  }
}
