import { join } from 'path';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { MailModule } from './mail/mail.module';
import { UploadModule } from './upload/upload.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CallsModule } from './calls/calls.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
      // Echappatoire reservee aux tests d'integration, qui enchainent des
      // dizaines de requetes depuis la meme adresse. Jamais definie en
      // production : sans la variable, le limiteur s'applique normalement.
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        // Railway (et la plupart des hebergeurs) fournissent une seule
        // DATABASE_URL. En local on retombe sur les variables separees.
        const url = config.get<string>('DATABASE_URL');

        // SSL uniquement si demande explicitement : le reseau prive Railway
        // (*.railway.internal) ne fait pas de TLS, le proxy public si.
        const ssl =
          config.get<string>('DB_SSL', 'false') === 'true'
            ? { rejectUnauthorized: false }
            : undefined;

        // Tracer la cible au demarrage : sans ca, une DATABASE_URL absente se
        // manifeste par un ECONNREFUSED sur localhost difficile a relier a sa
        // cause. Jamais l'URL complete, elle contient le mot de passe.
        const logger = new Logger('Database');
        if (url) {
          const { hostname, port: urlPort, pathname } = new URL(url);
          logger.log(`DATABASE_URL -> ${hostname}:${urlPort || 5432}${pathname}`);
        } else {
          logger.warn(
            `DATABASE_URL absente, repli sur ${config.get<string>('DB_HOST', 'localhost')}:${config.get<number>('DB_PORT', 5432)}. ` +
              'En production, definir DATABASE_URL.',
          );
        }

        return {
          type: 'postgres' as const,
          ...(url
            ? { url }
            : {
                host: config.get<string>('DB_HOST', 'localhost'),
                port: config.get<number>('DB_PORT', 5432),
                username: config.get<string>('DB_USERNAME', 'postgres'),
                password: config.get<string>('DB_PASSWORD', 'postgres'),
                database: config.get<string>('DB_NAME', 'teampulse'),
              }),
          ssl,
          autoLoadEntities: true,
          // Desactive par defaut : `synchronize` aligne le schema sur les
          // entites sans etat d'ame et peut supprimer une colonne — donc des
          // messages — au premier deploiement qui renomme un champ. Le schema
          // evolue desormais par migrations uniquement. DB_SYNCHRONIZE=true
          // reste possible en developpement, jamais en production.
          synchronize: config.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
          // Appliquees au demarrage : Railway n'offre pas d'etape de
          // deploiement separee ou les lancer a la main.
          migrations: [join(__dirname, 'migrations', '*.{js,ts}')],
          migrationsRun: true,
        };
      },
    }),
    MailModule,
    UsersModule,
    OrganizationsModule,
    AuthModule,
    ChatModule,
    UploadModule,
    NotificationsModule,
    CallsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
