import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { UsersService } from '../users/users.service';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expo = new Expo();

  constructor(private readonly usersService: UsersService) {}

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    const uniqueIds = [...new Set(userIds)].filter(Boolean);
    if (uniqueIds.length === 0) return;

    const tokens = await this.usersService.getPushTokens(uniqueIds);
    await this.sendToTokens(tokens, payload);
  }

  async sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
    const valid = [...new Set(tokens)].filter((t) =>
      Expo.isExpoPushToken(t),
    );
    if (valid.length === 0) return;

    const messages: ExpoPushMessage[] = valid.map((to) => ({
      to,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      badge: payload.badge,
      priority: 'high',
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const receipts = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...receipts);
      } catch (err) {
        this.logger.error(
          `Failed to send push chunk: ${(err as Error).message}`,
        );
      }
    }

    // Prune tokens that Expo reports as no longer registered.
    const deadTokens: string[] = [];
    tickets.forEach((ticket, i) => {
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
      ) {
        deadTokens.push(valid[i]);
      }
    });
    if (deadTokens.length > 0) {
      this.logger.warn(`Pruning ${deadTokens.length} dead push token(s)`);
      await this.usersService.pruneTokens(deadTokens);
    }
  }
}
