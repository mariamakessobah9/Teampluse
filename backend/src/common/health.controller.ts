import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CallStateService } from '../chat/call-state.service';

/**
 * Endpoint de healthcheck utilise par Railway (healthcheckPath: /api/health).
 * Exclu du rate limiting : les sondes tournent en continu.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly callState: CallStateService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      // 'redis' = plusieurs instances supportees ; 'memory' = repli, une
      // seule. Expose ici parce que l'information n'etait lisible que dans
      // les logs du conteneur.
      realtime: this.callState.isShared() ? 'redis' : 'memory',
    };
  }
}
