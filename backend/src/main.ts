import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

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

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Server listening on port ${port}`);
}
bootstrap();
