import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

/**
 * Duree de validite du jeton d'acces.
 *
 * Elle ne borne que la connexion initiale, pas la duree de l'appel : une fois
 * connecte, le client reste dans la salle et ses reconnexions automatiques ne
 * repassent pas par le jeton. Large assez pour couvrir un appel rejoint tard,
 * court assez pour qu'un jeton intercepte ne serve pas indefiniment.
 */
const TOKEN_TTL = '2h';

/**
 * Acces au SFU LiveKit.
 *
 * Le media ne transite plus de telephone a telephone : chaque participant
 * publie un flux montant unique vers le SFU, qui le redistribue. C'est ce qui
 * rend l'appel de groupe tenable — en maillage, un quatrieme participant
 * imposerait trois flux montants a chaque telephone — et c'est aussi ce qui
 * supprime le besoin d'un serveur TURN distinct : LiveKit Cloud en fournit un
 * et le client y bascule seul quand la connexion directe echoue.
 */
@Injectable()
export class LiveKitService {
  private readonly logger = new Logger('LiveKit');
  private warned = false;

  constructor(private readonly config: ConfigService) {}

  private get url(): string {
    return (this.config.get<string>('LIVEKIT_URL') ?? '').trim();
  }

  private get apiKey(): string {
    return (this.config.get<string>('LIVEKIT_API_KEY') ?? '').trim();
  }

  private get apiSecret(): string {
    return (this.config.get<string>('LIVEKIT_API_SECRET') ?? '').trim();
  }

  isConfigured(): boolean {
    const ok = !!(this.url && this.apiKey && this.apiSecret);
    if (!ok && !this.warned) {
      this.warned = true;
      this.logger.warn(
        'LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET absentes : ' +
          'les appels sont indisponibles.',
      );
    }
    return ok;
  }

  /**
   * Nom de salle derive de l'identifiant d'appel.
   *
   * Cote LiveKit la salle est creee implicitement a la premiere connexion et
   * detruite quand elle se vide : il n'y a rien a provisionner a l'avance.
   */
  roomName(callId: string): string {
    return `call-${callId}`;
  }

  /**
   * Jeton d'acces a la salle d'un appel.
   *
   * L'identite est l'identifiant utilisateur, jamais une valeur fournie par
   * le client : c'est elle qui apparait aux autres participants et qui sert a
   * les rattacher a un profil. Le droit `roomJoin` est limite a cette salle,
   * donc un jeton fuite n'ouvre pas les autres appels en cours.
   */
  async tokenFor(
    callId: string,
    user: { id: string; name?: string; avatar?: string },
  ): Promise<{ url: string; token: string; room: string }> {
    const room = this.roomName(callId);
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: user.id,
      name: user.name,
      ttl: TOKEN_TTL,
      metadata: JSON.stringify({ avatar: user.avatar ?? null }),
    });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      // Utilise pour les signaux legers dans la salle (main levee, etat du
      // micro) sans repasser par le serveur applicatif.
      canPublishData: true,
    });
    return { url: this.url, token: await at.toJwt(), room };
  }

  /**
   * Ferme la salle cote SFU a la fin d'un appel.
   *
   * Un client qui a perdu le socket applicatif mais garde sa connexion
   * LiveKit continuerait sinon a publier son micro dans une salle que tout le
   * monde croit fermee. En echec, on se contente de tracer : la salle se vide
   * d'elle-meme quand le dernier participant part.
   */
  async closeRoom(callId: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      const client = new RoomServiceClient(
        this.url.replace(/^ws/, 'http'),
        this.apiKey,
        this.apiSecret,
      );
      await client.deleteRoom(this.roomName(callId));
    } catch (e) {
      this.logger.debug(
        `Fermeture de la salle ${callId} ignoree : ${(e as Error).message}`,
      );
    }
  }
}
