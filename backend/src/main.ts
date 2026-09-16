import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './common/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Derriere le proxy Railway, sans ceci toutes les requetes portent l'IP du
  // proxy : le ThrottlerGuard limiterait alors l'ensemble des utilisateurs
  // a 60 req/min cumulees au lieu de 60 par client.
  app.set('trust proxy', 1);

  const corsOrigins = process.env.CORS_ORIGINS;
  app.enableCors({
    origin:
      !corsOrigins || corsOrigins === '*'
        ? true
        : corsOrigins.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  // Doit etre installe avant listen() : c'est la que le serveur Socket.IO est
  // cree. Sans REDIS_URL l'adapter reste en memoire et le comportement est
  // celui d'avant.
  const socketAdapter = new RedisIoAdapter(app, process.env.REDIS_URL);
  await socketAdapter.connect();
  app.useWebSocketAdapter(socketAdapter);

  const port = process.env.PORT || 3000;
  // '::' = dual-stack (IPv4 + IPv6). '0.0.0.0' binderait en IPv4 seul, or le
  // reseau interne de Railway est en IPv6 : le proxy ne joindrait pas le
  // conteneur et renverrait 502 "Application failed to respond".
  await app.listen(port, '::');
  console.log(`Server listening on port ${port}`);
}
bootstrap();
