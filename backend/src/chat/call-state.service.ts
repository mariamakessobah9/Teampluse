import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

export interface ActiveCall {
  callId: string;
  callerId: string;
  calleeId: string;
  type: string; // 'audio' | 'video'
  startedAt: number | null; // renseigne quand le destinataire accepte
}

/**
 * Un appel jamais raccroche proprement (crash d'instance, reseau coupe)
 * expirerait sinon indefiniment dans Redis.
 */
const TTL_SECONDS = 4 * 60 * 60;

const callKey = (callId: string) => `call:${callId}`;
const userCallsKey = (userId: string) => `user-calls:${userId}`;

/**
 * Etat des appels en cours, partage entre instances.
 *
 * L'appelant et l'appele peuvent etre servis par deux replicas differents :
 * une Map locale rendrait l'appel introuvable au moment de l'acceptation.
 * Sans REDIS_URL, repli en memoire pour le developpement local.
 */
@Injectable()
export class CallStateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CallState');
  private client: RedisClientType | null = null;
  private readonly memory = new Map<string, ActiveCall>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.warn(
        'REDIS_URL absente : etat des appels en memoire, une seule instance supportee.',
      );
      return;
    }

    const client: RedisClientType = createClient({ url });
    client.on('error', (e) => this.logger.error(`Redis: ${e.message}`));
    await client.connect();
    this.client = client;
    this.logger.log('Etat des appels partage via Redis.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }

  async set(call: ActiveCall): Promise<void> {
    if (!this.client) {
      this.memory.set(call.callId, call);
      return;
    }
    // L'index par utilisateur sert a retrouver les appels a raccrocher quand
    // quelqu'un se deconnecte, sans balayer tout Redis.
    await this.client
      .multi()
      .set(callKey(call.callId), JSON.stringify(call), { EX: TTL_SECONDS })
      .sAdd(userCallsKey(call.callerId), call.callId)
      .expire(userCallsKey(call.callerId), TTL_SECONDS)
      .sAdd(userCallsKey(call.calleeId), call.callId)
      .expire(userCallsKey(call.calleeId), TTL_SECONDS)
      .exec();
  }

  async get(callId: string): Promise<ActiveCall | null> {
    if (!this.client) return this.memory.get(callId) ?? null;
    // node-redis v5 type le retour de get() en `string | {}` selon le
    // decodeur configure ; ici c'est bien une chaine.
    const raw = (await this.client.get(callKey(callId))) as string | null;
    return raw ? (JSON.parse(raw) as ActiveCall) : null;
  }

  /** Marque le debut effectif de l'appel et renvoie l'etat mis a jour. */
  async markStarted(callId: string): Promise<ActiveCall | null> {
    const call = await this.get(callId);
    if (!call) return null;
    call.startedAt = Date.now();
    await this.set(call);
    return call;
  }

  async delete(callId: string): Promise<void> {
    if (!this.client) {
      this.memory.delete(callId);
      return;
    }
    const call = await this.get(callId);
    const multi = this.client.multi().del(callKey(callId));
    if (call) {
      multi.sRem(userCallsKey(call.callerId), callId);
      multi.sRem(userCallsKey(call.calleeId), callId);
    }
    await multi.exec();
  }

  async findByUser(userId: string): Promise<ActiveCall[]> {
    if (!this.client) {
      return [...this.memory.values()].filter(
        (c) => c.callerId === userId || c.calleeId === userId,
      );
    }
    const ids = await this.client.sMembers(userCallsKey(userId));
    const calls = await Promise.all(ids.map((id) => this.get(id)));
    return calls.filter((c): c is ActiveCall => c !== null);
  }
}
