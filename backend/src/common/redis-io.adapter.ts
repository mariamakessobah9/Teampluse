import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ServerOptions } from 'socket.io';

/**
 * Sans adapter, `server.emit` ne touche que les sockets portes par l'instance
 * courante : avec plusieurs replicas, deux utilisateurs connectes a des
 * instances differentes ne se voient pas. L'adapter Redis relaie les
 * diffusions et rend `fetchSockets()` global.
 *
 * Sans REDIS_URL on garde l'adapter en memoire : le developpement local
 * fonctionne a l'identique, mais une seule instance est alors supportee.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger('SocketIO');
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly url?: string,
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    if (!this.url) {
      this.logger.warn(
        'REDIS_URL absente : diffusion en memoire, une seule instance supportee.',
      );
      return;
    }

    const pubClient = createClient({ url: this.url });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (e) => this.logger.error(`Redis pub: ${e.message}`));
    subClient.on('error', (e) => this.logger.error(`Redis sub: ${e.message}`));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Adapter Redis actif : diffusion partagee entre instances.');
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
