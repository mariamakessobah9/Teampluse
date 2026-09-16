import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Endpoint de healthcheck utilise par Railway (healthcheckPath: /api/health).
 * Exclu du rate limiting : les sondes tournent en continu.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
