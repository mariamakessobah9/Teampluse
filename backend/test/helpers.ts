import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

export interface Session {
  token: string;
  userId: string;
  email: string;
}

/**
 * Monte l'application exactement comme `main.ts` : memes pipes, meme prefixe.
 * Sans cela, les tests valideraient un assemblage qui n'existe nulle part.
 */
export async function bootstrapTestApp(): Promise<{
  app: INestApplication;
  db: DataSource;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  // Journalisation coupee : le transport e-mail est volontairement absent et
  // chaque inscription produit une erreur attendue, qui noierait les echecs
  // reels dans la sortie.
  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  return { app, db: app.get(DataSource) };
}

/** Vide les tables entre deux fichiers de test, en gardant le schema. */
export async function truncateAll(db: DataSource): Promise<void> {
  await db.query(`
    TRUNCATE TABLE
      "chat_room_members", "messages", "calls",
      "chat_rooms", "invitations", "users", "organizations"
    RESTART IDENTITY CASCADE
  `);
}

/** Recupere le code a usage unique directement en base, faute d'e-mail. */
export async function readOtp(db: DataSource, email: string): Promise<string> {
  const [row] = await db.query(
    'SELECT otp FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  if (!row?.otp) throw new Error(`Aucun OTP en attente pour ${email}`);
  return row.otp;
}
