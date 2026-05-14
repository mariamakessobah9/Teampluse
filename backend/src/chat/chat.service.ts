import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { ChatRoom } from './entities/chat-room.entity';
import { Message } from './entities/message.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatRoom)
    private readonly roomsRepo: Repository<ChatRoom>,
    @InjectRepository(Message)
    private readonly messagesRepo: Repository<Message>,
    private readonly usersService: UsersService,
  ) {}

  async createDirectRoom(userId1: string, userId2: string): Promise<ChatRoom> {
    const candidates = await this.roomsRepo
      .createQueryBuilder('room')
      .innerJoin('room.members', 'member', 'member.id = :userId1', { userId1 })
      .leftJoinAndSelect('room.members', 'allMembers')
      .where('room.type = :type', { type: 'direct' })
      .getMany();

    const existing = candidates.find(
      (r) =>
        r.members.length === 2 && r.members.some((m) => m.id === userId2),
    );

    if (existing) return existing;

    const user1 = await this.usersService.findById(userId1);
    const user2 = await this.usersService.findById(userId2);

    const room = this.roomsRepo.create({
      type: 'direct',
      members: [user1, user2],
    });

    return this.roomsRepo.save(room);
  }

  async createGroupRoom(
    name: string,
    adminId: string,
    memberIds: string[],
  ): Promise<ChatRoom> {
    const allIds = [...new Set([adminId, ...memberIds])];
    const members = await Promise.all(
      allIds.map((id) => this.usersService.findById(id)),
    );

    const room = this.roomsRepo.create({
      name,
      type: 'group',
      adminId,
      members,
    });

    return this.roomsRepo.save(room);
  }

  async getRoomById(id: string): Promise<ChatRoom> {
    const room = await this.roomsRepo.findOne({
      where: { id },
      relations: ['members'],
    });
    if (!room) throw new NotFoundException('Chat room not found');
    return room;
  }

  async getUserRooms(userId: string): Promise<any[]> {
    const rooms = await this.roomsRepo
      .createQueryBuilder('room')
      .innerJoin('room.members', 'member', 'member.id = :userId', { userId })
      .leftJoinAndSelect('room.members', 'allMembers')
      .orderBy('room.updatedAt', 'DESC')
      .getMany();

    const result = await Promise.all(
      rooms.map(async (room) => {
        const lastMessage = await this.messagesRepo.findOne({
          where: { chatRoomId: room.id },
          order: { createdAt: 'DESC' },
          relations: ['sender'],
        });

        const unreadCount = await this.messagesRepo.count({
          where: {
            chatRoomId: room.id,
            senderId: Not(userId),
            status: In(['sent', 'delivered']),
          },
        });

        return { ...room, lastMessage, unreadCount };
      }),
    );

    return result;
  }

  async sendMessage(
    chatRoomId: string,
    senderId: string,
    content: string,
    type = 'text',
    fileUrl?: string,
    extras?: { fileName?: string; fileSize?: number; duration?: number },
  ): Promise<Message> {
    const message = this.messagesRepo.create({
      content,
      type,
      fileUrl,
      fileName: extras?.fileName,
      fileSize: extras?.fileSize,
      duration: extras?.duration,
      senderId,
      chatRoomId,
    });

    const saved = await this.messagesRepo.save(message);

    // Update room's updatedAt
    await this.roomsRepo.update(chatRoomId, { updatedAt: new Date() });

    return this.messagesRepo.findOne({
      where: { id: saved.id },
      relations: ['sender'],
    });
  }

  async getRoomMessages(
    chatRoomId: string,
    page = 1,
    limit = 50,
  ): Promise<Message[]> {
    return this.messagesRepo.find({
      where: { chatRoomId },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async markMessagesAsRead(
    chatRoomId: string,
    userId: string,
  ): Promise<void> {
    await this.messagesRepo
      .createQueryBuilder()
      .update(Message)
      .set({ status: 'read' })
      .where('chat_room_id = :chatRoomId', { chatRoomId })
      .andWhere('sender_id != :userId', { userId })
      .andWhere('status != :status', { status: 'read' })
      .execute();
  }

  private async loadGroupOrFail(roomId: string): Promise<ChatRoom> {
    const room = await this.roomsRepo.findOne({
      where: { id: roomId },
      relations: ['members'],
    });
    if (!room) throw new NotFoundException('Chat room not found');
    if (room.type !== 'group')
      throw new BadRequestException('Operation only allowed on group rooms');
    return room;
  }

  private assertAdmin(room: ChatRoom, userId: string): void {
    if (room.adminId !== userId)
      throw new ForbiddenException('Only the group admin can do this');
  }

  private assertMember(room: ChatRoom, userId: string): void {
    if (!room.members.some((m) => m.id === userId))
      throw new ForbiddenException('You are not a member of this group');
  }

  async renameGroup(
    roomId: string,
    requesterId: string,
    name: string,
  ): Promise<ChatRoom> {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('Name cannot be empty');

    const room = await this.loadGroupOrFail(roomId);
    this.assertAdmin(room, requesterId);

    room.name = trimmed;
    return this.roomsRepo.save(room);
  }

  async updateGroupAvatar(
    roomId: string,
    requesterId: string,
    avatar: string | null,
  ): Promise<ChatRoom> {
    const room = await this.loadGroupOrFail(roomId);
    this.assertAdmin(room, requesterId);

    room.avatar = avatar || null;
    return this.roomsRepo.save(room);
  }

  async addMembers(
    roomId: string,
    requesterId: string,
    memberIds: string[],
  ): Promise<ChatRoom> {
    if (!Array.isArray(memberIds) || memberIds.length === 0)
      throw new BadRequestException('memberIds must be a non-empty array');

    const room = await this.loadGroupOrFail(roomId);
    this.assertAdmin(room, requesterId);

    const existingIds = new Set(room.members.map((m) => m.id));
    const newIds = memberIds.filter((id) => !existingIds.has(id));

    if (newIds.length === 0) return room;

    const newMembers = await Promise.all(
      newIds.map((id) => this.usersService.findById(id)),
    );
    room.members = [...room.members, ...newMembers];
    return this.roomsRepo.save(room);
  }

  async removeMember(
    roomId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<ChatRoom> {
    const room = await this.loadGroupOrFail(roomId);
    this.assertAdmin(room, requesterId);

    if (targetUserId === requesterId)
      throw new BadRequestException(
        'Admin cannot remove themselves — use leave or transfer-admin',
      );

    if (!room.members.some((m) => m.id === targetUserId))
      throw new NotFoundException('User is not a member of this group');

    room.members = room.members.filter((m) => m.id !== targetUserId);
    return this.roomsRepo.save(room);
  }

  async leaveGroup(
    roomId: string,
    userId: string,
  ): Promise<{ removed: boolean; room?: ChatRoom }> {
    const room = await this.loadGroupOrFail(roomId);
    this.assertMember(room, userId);

    if (room.adminId === userId && room.members.length > 1)
      throw new BadRequestException(
        'Admin must transfer admin role before leaving',
      );

    room.members = room.members.filter((m) => m.id !== userId);

    if (room.members.length === 0) {
      await this.roomsRepo.remove(room);
      return { removed: true };
    }

    const saved = await this.roomsRepo.save(room);
    return { removed: false, room: saved };
  }

  async transferAdmin(
    roomId: string,
    requesterId: string,
    newAdminId: string,
  ): Promise<ChatRoom> {
    const room = await this.loadGroupOrFail(roomId);
    this.assertAdmin(room, requesterId);

    if (newAdminId === requesterId) return room;

    if (!room.members.some((m) => m.id === newAdminId))
      throw new BadRequestException('New admin must already be a member');

    room.adminId = newAdminId;
    return this.roomsRepo.save(room);
  }
}
