import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Call } from './call.entity';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { IceService } from './ice.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Call]), AuthModule],
  providers: [CallsService, IceService],
  controllers: [CallsController],
  exports: [CallsService],
})
export class CallsModule {}
