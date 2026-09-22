import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType, WatchError } from 'redis';

/**
 * invited   ca sonne chez lui
 * joined    dans la salle
 * left      a quitte la salle apres y etre entre
 * declined  a refuse
 * missed    a laisse sonner jusqu'au bout
 */
export type ParticipantState =
  | 'invited'
  | 'joined'
  | 'left'
  | 'declined'
  | 'missed';

export interface ActiveParticipant {
  userId: string;
  state: ParticipantState;
  /** Horodatage de l'entree courante dans la salle, nul hors de la salle. */
  joinedAt: number | null;
  /** Temps de presence deja accumule, en secondes (plusieurs passages). */
  duration: number;
}

export interface ActiveCall {
  callId: string;
  /** Celui qui a lance l'appel. Toujours present dans `participants`. */
  callerId: string;
  mode: 'direct' | 'group';
  /** Salon a l'origine de l'appel, nul pour un direct ou un groupe ad hoc. */
  roomId: string | null;
  type: string; // 'audio' | 'video'
  /** Renseigne des qu'un second participant rejoint. */
  startedAt: number | null;
  participants: Record<string, ActiveParticipant>;
  /**
   * Pose une seule fois, par la cloture : deux departs simultanes
   * declencheraient sinon deux clotures, donc deux lignes d'historique.
   */
  endedAt?: number | null;
}

/**
 * Un appel jamais raccroche proprement (crash d'instance, reseau coupe)
 * expirerait sinon indefiniment dans Redis.
 */
const TTL_SECONDS = 4 * 60 * 60;

/**
 * Le prefixe porte une version : l'etat a change de forme en passant aux
 * appels de groupe (`calleeId` unique remplace par une table de
 * participants). Sans ce changement de cle, les appels encore en vol au
 * moment du deploiement seraient relus dans l'ancienne forme et planteraient
 * a la premiere lecture de `participants`.
 */
const callKey = (callId: string) => `call:v2:${callId}`;
const userCallsKey = (userId: string) => `user-calls:v2:${userId}`;
const roomCallKey = (roomId: string) => `room-call:v2:${roomId}`;

/** Nombre de reprises sur conflit d'ecriture concurrente. */
const MUTATE_RETRIES = 5;

export const participantIds = (call: ActiveCall): string[] =>
  Object.keys(call.participants ?? {});

export const joinedIds = (call: ActiveCall): string[] =>
  participantIds(call).filter((id) => call.participants[id].state === 'joined');

export const newParticipant = (
  userId: string,
  state: ParticipantState,
): ActiveParticipant => ({
  userId,
  state,
  joinedAt: state === 'joined' ? Date.now() : null,
  duration: 0,
});

/**
 * Etat des appels en cours, partage entre instances.
 *
 * Les participants peuvent etre servis par des replicas differents : une Map
 * locale rendrait l'appel introuvable au moment de l'acceptation. Sans
 * REDIS_URL, repli en memoire pour le developpement local.
 */
@Injectable()
export class CallStateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CallState');
  private client: RedisClientType | null = null;
  /**
   * Connexion reservee aux transactions. WATCH s'applique a toute une
   * connexion : partage avec les lectures ordinaires, il surveillerait (et
   * ferait echouer) au hasard des commandes etrangeres. node-redis v5 n'a
   * plus `executeIsolated`, d'ou cette connexion dediee, servie a une
   * transaction a la fois.
   */
  private txClient: RedisClientType | null = null;
  private txQueue: Promise<unknown> = Promise.resolve();
  private readonly memory = new Map<string, ActiveCall>();
  private readonly memoryRooms = new Map<string, string>();

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
    const txClient = client.duplicate();
    txClient.on('error', (e) => this.logger.error(`Redis (tx): ${e.message}`));
    await txClient.connect();
    this.client = client;
    this.txClient = txClient as RedisClientType;
    this.logger.log('Etat des appels partage via Redis.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
    await this.txClient?.quit().catch(() => undefined);
  }

  /** Execute `fn` sur la connexion de transaction, une a la fois. */
  private inTransaction<T>(fn: (tx: RedisClientType) => Promise<T>): Promise<T> {
    const run = this.txQueue.then(() => fn(this.txClient!));
    this.txQueue = run.catch(() => undefined);
    return run;
  }

  /**
   * true = etat partage via Redis (plusieurs instances possibles),
   * false = repli en memoire (une seule instance).
   */
  isShared(): boolean {
    return this.client !== null;
  }

  async set(call: ActiveCall): Promise<void> {
    if (!this.client) {
      this.memory.set(call.callId, call);
      return;
    }
    // L'index par utilisateur sert a retrouver les appels a quitter quand
    // quelqu'un se deconnecte, sans balayer tout Redis.
    const multi = this.client
      .multi()
      .set(callKey(call.callId), JSON.stringify(call), { EX: TTL_SECONDS });
    for (const userId of participantIds(call)) {
      multi.sAdd(userCallsKey(userId), call.callId);
      multi.expire(userCallsKey(userId), TTL_SECONDS);
    }
    await multi.exec();
  }

  async get(callId: string): Promise<ActiveCall | null> {
    if (!callId) return null;
    if (!this.client) return this.memory.get(callId) ?? null;
    // node-redis v5 type le retour de get() en `string | {}` selon le
    // decodeur configure ; ici c'est bien une chaine.
    const raw = (await this.client.get(callKey(callId))) as string | null;
    return raw ? (JSON.parse(raw) as ActiveCall) : null;
  }

  /**
   * Lecture-modification-ecriture atomique.
   *
   * Dans un appel de groupe, plusieurs participants decrochent souvent dans
   * la meme seconde. Un `get` suivi d'un `set` perdrait l'un des deux
   * changements et ferait disparaitre un participant de l'etat partage, donc
   * de la salle pour tous les autres. WATCH fait echouer la transaction si la
   * cle a bouge entre-temps, et on rejoue sur l'etat frais.
   *
   * Le mutateur renvoie `null` pour abandonner sans ecrire.
   */
  async mutate(
    callId: string,
    mutator: (call: ActiveCall) => ActiveCall | null,
  ): Promise<ActiveCall | null> {
    if (!callId) return null;

    if (!this.client) {
      const current = this.memory.get(callId);
      if (!current) return null;
      // Copie : un mutateur qui modifie puis abandonne ne doit rien laisser.
      const next = mutator(structuredClone(current));
      if (next) this.memory.set(callId, next);
      return next;
    }

    for (let attempt = 0; attempt < MUTATE_RETRIES; attempt++) {
      const result = await this.inTransaction(async (tx) => {
        await tx.watch(callKey(callId));
        const raw = (await tx.get(callKey(callId))) as string | null;
        const next = raw ? mutator(JSON.parse(raw) as ActiveCall) : null;
        if (!next) {
          await tx.unwatch();
          return { retry: false, call: null as ActiveCall | null };
        }
        const multi = tx
          .multi()
          .set(callKey(callId), JSON.stringify(next), { EX: TTL_SECONDS });
        for (const userId of participantIds(next)) {
          multi.sAdd(userCallsKey(userId), callId);
          multi.expire(userCallsKey(userId), TTL_SECONDS);
        }
        try {
          await multi.exec();
          return { retry: false, call: next };
        } catch (e) {
          // node-redis v5 leve WatchError quand la cle surveillee a change
          // entre-temps : on rejoue sur l'etat frais.
          if (e instanceof WatchError) {
            return { retry: true, call: null as ActiveCall | null };
          }
          throw e;
        }
      });

      if (!result.retry) return result.call;
    }

    this.logger.warn(
      `Etat de l'appel ${callId} trop dispute, modification abandonnee.`,
    );
    return null;
  }

  /**
   * Marque le debut effectif de l'appel, si ce n'est pas deja fait, et
   * renvoie l'etat mis a jour.
   */
  async markStarted(callId: string): Promise<ActiveCall | null> {
    return this.mutate(callId, (call) => {
      if (call.startedAt) return call;
      call.startedAt = Date.now();
      return call;
    });
  }

  async delete(callId: string): Promise<void> {
    if (!this.client) {
      this.memory.delete(callId);
      return;
    }
    const call = await this.get(callId);
    const multi = this.client.multi().del(callKey(callId));
    for (const userId of call ? participantIds(call) : []) {
      multi.sRem(userCallsKey(userId), callId);
    }
    await multi.exec();
  }

  /**
   * Appel en cours dans un salon, s'il y en a un.
   *
   * Un salon n'a qu'un appel a la fois : sans cet index, deux membres qui
   * lancent l'appel dans la meme seconde ouvriraient deux salles distinctes
   * et le groupe se retrouverait coupe en deux.
   */
  async getRoomCall(roomId: string): Promise<ActiveCall | null> {
    if (!roomId) return null;
    const callId = this.client
      ? ((await this.client.get(roomCallKey(roomId))) as string | null)
      : (this.memoryRooms.get(roomId) ?? null);
    if (!callId) return null;
    const call = await this.get(callId);
    // Index orphelin (appel expire sans nettoyage) : on le purge au passage.
    if (!call) await this.releaseRoomCall(roomId, callId);
    return call;
  }

  /**
   * Reserve le salon pour cet appel. Renvoie l'identifiant de l'appel qui
   * occupe deja le salon si la reservation echoue, `null` sinon.
   */
  async claimRoomCall(roomId: string, callId: string): Promise<string | null> {
    const existing = await this.getRoomCall(roomId);
    if (existing) return existing.callId;
    if (!this.client) {
      this.memoryRooms.set(roomId, callId);
      return null;
    }
    const ok = await this.client.set(roomCallKey(roomId), callId, {
      NX: true,
      EX: TTL_SECONDS,
    });
    if (ok) return null;
    return ((await this.client.get(roomCallKey(roomId))) as string | null) ?? null;
  }

  async releaseRoomCall(roomId: string, callId: string): Promise<void> {
    if (!this.client) {
      if (this.memoryRooms.get(roomId) === callId) {
        this.memoryRooms.delete(roomId);
      }
      return;
    }
    // Ne libere que sa propre reservation : un appel suivant a pu la prendre.
    const current = (await this.client.get(roomCallKey(roomId))) as
      | string
      | null;
    if (current === callId) await this.client.del(roomCallKey(roomId));
  }

  async findByUser(userId: string): Promise<ActiveCall[]> {
    if (!this.client) {
      return [...this.memory.values()].filter((c) =>
        participantIds(c).includes(userId),
      );
    }
    const ids = await this.client.sMembers(userCallsKey(userId));
    const calls = await Promise.all(ids.map((id) => this.get(id)));
    return calls.filter((c): c is ActiveCall => c !== null);
  }
}
