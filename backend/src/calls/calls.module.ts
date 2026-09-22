import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Call } from './call.entity';
import { CallParticipant } from './call-participant.entity';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { LiveKitService } from './livekit.service';
import { CallStateService } from './call-state.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Call, CallParticipant]),
    AuthModule,
    UsersModule,
  ],
  providers: [CallsService, LiveKitService, CallStateService],
  controllers: [CallsController],
  exports: [CallsService, LiveKitService, CallStateService],
})
export class CallsModule {}
