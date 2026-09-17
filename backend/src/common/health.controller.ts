import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CallStateService } from '../chat/call-state.service';
import { MailService } from '../mail/mail.service';

/**
 * Endpoint de healthcheck utilise par Railway (healthcheckPath: /api/health).
 * Exclu du rate limiting : les sondes tournent en continu.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly callState: CallStateService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private set(...keys: string[]): boolean {
    return keys.every((k) => Boolean(this.config.get<string>(k)));
  }

  /**
   * Teste la connexion SMTP sans envoyer de message. Contrairement au reste
   * du controleur, cette route reste soumise au rate limiting : elle ouvre
   * une connexion sortante a chaque appel.
   */
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('mail')
  async checkMail() {
    return this.mail.verify();
  }

  @Get()
  check() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      // 'redis' = plusieurs instances supportees ; 'memory' = repli, une seule.
      realtime: this.callState.isShared() ? 'redis' : 'memory',
      // Booleens uniquement, jamais les valeurs. L'envoi d'OTP et les uploads
      // echouent en silence quand leurs variables manquent : sans ce champ, la
      // seule trace est dans les logs du conteneur.
      services: {
        mail: this.mail.provider() !== 'none',
        mailProvider: this.mail.provider(),
        uploads: this.set(
          'CLOUDINARY_CLOUD_NAME',
          'CLOUDINARY_API_KEY',
          'CLOUDINARY_API_SECRET',
        ),
        turn: this.set('TURN_URLS'),
      },
    };
  }
}
