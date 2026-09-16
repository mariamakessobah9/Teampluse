import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

const DEFAULT_STUN = 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';

const list = (raw: string | undefined): string[] =>
  (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Fournit la configuration ICE aux clients.
 *
 * Servie par l'API plutot qu'ecrite en dur dans l'app : les identifiants TURN
 * changent (rotation, changement de fournisseur), et une valeur embarquee dans
 * le bundle imposerait une nouvelle publication sur le Play Store a chaque
 * fois, avec le delai de validation que cela implique.
 */
@Injectable()
export class IceService {
  private readonly logger = new Logger('Ice');
  private warned = false;

  constructor(private readonly config: ConfigService) {}

  forUser(userId: string): { iceServers: IceServer[] } {
    const iceServers: IceServer[] = [];

    const stun = list(this.config.get<string>('STUN_URLS') ?? DEFAULT_STUN);
    if (stun.length) iceServers.push({ urls: stun });

    const turnUrls = list(this.config.get<string>('TURN_URLS'));
    if (!turnUrls.length) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          'TURN_URLS absente : appels en pair-a-pair uniquement. Les reseaux ' +
            'a NAT symetrique ne pourront pas etablir le flux audio/video.',
        );
      }
      return { iceServers };
    }

    // Mode recommande : identifiants ephemeres (TURN REST API, supporte par
    // coturn --use-auth-secret et par la plupart des offres managees). Le
    // secret ne quitte jamais le serveur et les identifiants expirent.
    const secret = this.config.get<string>('TURN_SECRET');
    if (secret) {
      const ttl = Number(this.config.get<string>('TURN_TTL_SECONDS') ?? 86400);
      const username = `${Math.floor(Date.now() / 1000) + ttl}:${userId}`;
      const credential = createHmac('sha1', secret)
        .update(username)
        .digest('base64');
      iceServers.push({ urls: turnUrls, username, credential });
      return { iceServers };
    }

    // Repli : identifiants statiques, acceptes mais moins souhaitables —
    // ils ne changent pas et sont distribues tels quels a chaque client.
    const username = this.config.get<string>('TURN_USERNAME');
    const credential = this.config.get<string>('TURN_PASSWORD');
    if (username && credential) {
      iceServers.push({ urls: turnUrls, username, credential });
    } else if (!this.warned) {
      this.warned = true;
      this.logger.warn(
        'TURN_URLS definie sans TURN_SECRET ni TURN_USERNAME/TURN_PASSWORD : ' +
          'le relais TURN sera refuse par le serveur.',
      );
    }

    return { iceServers };
  }
}
