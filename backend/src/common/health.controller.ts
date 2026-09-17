import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { CallStateService } from '../chat/call-state.service';

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
  ) {}

  private set(...keys: string[]): boolean {
    return keys.every((k) => Boolean(this.config.get<string>(k)));
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
        mail: this.set('MAIL_HOST', 'MAIL_USER', 'MAIL_PASS'),
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
