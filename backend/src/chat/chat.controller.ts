import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

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
    const room = await this.chatService.createGroupRoom(
      name,
      userId,
      memberIds,
    );
    this.chatGateway.emitRoomCreated(room);
    return room;
  }

  @Get('rooms/:id/messages')
  async getRoomMessages(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.chatService.getRoomMessages(roomId, +page, +limit, userId);
  }

  @Delete('messages/:id/me')
  async deleteMessageForMe(
    @Param('id') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.chatService.deleteMessageForMe(messageId, userId);
    return { ok: true };
  }

  @Delete('messages/:id/everyone')
  async deleteMessageForEveryone(
    @Param('id') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    const message = await this.chatService.deleteMessageForEveryone(
      messageId,
      userId,
    );
    this.chatGateway.emitMessageDeleted(message.chatRoomId, message.id);
    return { ok: true };
  }

  @Post('rooms/:id/pin')
  async pinRoom(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.usersService.pinRoom(userId, roomId);
    return { ok: true };
  }

  @Delete('rooms/:id/pin')
  async unpinRoom(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.usersService.unpinRoom(userId, roomId);
    return { ok: true };
  }

  @Patch('rooms/:id')
  async updateGroup(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { name?: string; avatar?: string | null },
  ) {
    let room;
    if (typeof body.name === 'string') {
      room = await this.chatService.renameGroup(roomId, userId, body.name);
    }
    if (body.avatar !== undefined) {
      room = await this.chatService.updateGroupAvatar(
        roomId,
        userId,
        body.avatar,
      );
    }
    if (!room) {
      room = await this.chatService.getRoomById(roomId);
    }
    this.chatGateway.emitRoomUpdated(room);
    return room;
  }

  @Post('rooms/:id/members')
  async addMembers(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
    @Body('memberIds') memberIds: string[],
  ) {
    const room = await this.chatService.addMembers(roomId, userId, memberIds);
    this.chatGateway.emitRoomUpdated(room);
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      this.notificationsService
        .sendToUsers(memberIds, {
          title: room.name || 'Group',
          body: 'You were added to the group',
          data: { type: 'group', roomId },
        })
        .catch(() => undefined);
    }
    return room;
  }

  @Delete('rooms/:id/members/:userId')
  async removeMember(
    @Param('id') roomId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    const room = await this.chatService.removeMember(
      roomId,
      requesterId,
      targetUserId,
    );
    this.chatGateway.emitMemberRemoved(roomId, targetUserId, room);
    this.notificationsService
      .sendToUsers([targetUserId], {
        title: room.name || 'Group',
        body: 'You were removed from the group',
        data: { type: 'group', roomId },
      })
      .catch(() => undefined);
    return room;
  }

  @Post('rooms/:id/leave')
  async leaveGroup(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.chatService.leaveGroup(roomId, userId);
    if (result.removed) {
      this.chatGateway.emitRoomDeleted(roomId);
    } else if (result.room) {
      this.chatGateway.emitMemberRemoved(roomId, userId, result.room);
    }
    return result;
  }

  @Post('rooms/:id/transfer-admin')
  async transferAdmin(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
    @Body('newAdminId') newAdminId: string,
  ) {
    const room = await this.chatService.transferAdmin(
      roomId,
      userId,
      newAdminId,
    );
    this.chatGateway.emitRoomUpdated(room);
    if (newAdminId && newAdminId !== userId) {
      this.notificationsService
        .sendToUsers([newAdminId], {
          title: room.name || 'Group',
          body: 'You are now the group admin',
          data: { type: 'group', roomId },
        })
        .catch(() => undefined);
    }
    return room;
  }
}
