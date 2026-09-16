import { Module } from '@nestjs/common';
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
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 60 },
    ]),
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
          // Laisser a true pour le tout premier deploiement (creation des
          // tables), puis passer DB_SYNCHRONIZE=false et utiliser des
          // migrations : sinon TypeORM peut supprimer des colonnes en prod.
          synchronize: config.get<string>('DB_SYNCHRONIZE', 'true') !== 'false',
        };
      },
    }),
    MailModule,
    UsersModule,
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
