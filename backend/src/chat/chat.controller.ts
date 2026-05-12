import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms')
  async getUserRooms(@CurrentUser('id') userId: string) {
    return this.chatService.getUserRooms(userId);
  }

  @Post('rooms/direct')
  async createDirectRoom(
    @CurrentUser('id') userId: string,
    @Body('targetUserId') targetUserId: string,
  ) {
    return this.chatService.createDirectRoom(userId, targetUserId);
  }

  @Post('rooms/group')
  async createGroupRoom(
    @CurrentUser('id') userId: string,
    @Body('name') name: string,
    @Body('memberIds') memberIds: string[],
  ) {
    return this.chatService.createGroupRoom(name, userId, memberIds);
  }

  @Get('rooms/:id/messages')
  async getRoomMessages(
    @Param('id') roomId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.chatService.getRoomMessages(roomId, +page, +limit);
  }
}
