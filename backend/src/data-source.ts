import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from './users/user.entity';
import { ChatRoom } from './chat/entities/chat-room.entity';
import { Message } from './chat/entities/message.entity';
import { Call } from './calls/call.entity';
import { CallParticipant } from './calls/call-participant.entity';
import { Organization } from './organizations/organization.entity';
import { Invitation } from './organizations/invitation.entity';

/**
 * DataSource destinee au CLI TypeORM (generation et execution des migrations).
 * L'application, elle, construit sa connexion dans AppModule : ce fichier ne
 * sert qu'aux commandes `npm run migration:*`.
 *
 * Les entites sont listees explicitement plutot que par glob : le CLI tourne
 * sur les sources TypeScript, l'application sur le `dist`, et un glob
 * fonctionnant dans l'un echoue dans l'autre.
 */
export const entities = [
  User,
  ChatRoom,
  Message,
  Call,
  CallParticipant,
  Organization,
  Invitation,
];

const url = process.env.DATABASE_URL;

export default new DataSource({
  type: 'postgres',
  ...(url
    ? { url }
    : {
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_NAME ?? 'teampulse',
      }),
  ssl:
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  entities,
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
