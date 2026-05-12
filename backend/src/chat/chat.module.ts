import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatRoom } from './entities/chat-room.entity';
import { Message } from './entities/message.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatRoom, Message]),
    UsersModule,
    AuthModule,
  ],
  providers: [ChatService, ChatGateway],
  controllers: [ChatController],
})
export class ChatModule {}
