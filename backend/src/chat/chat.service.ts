import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
    // Check if direct room already exists between these users
    const existing = await this.roomsRepo
      .createQueryBuilder('room')
      .innerJoin('room.members', 'member')
      .where('room.type = :type', { type: 'direct' })
      .groupBy('room.id')
      .having('COUNT(CASE WHEN member.id IN (:...ids) THEN 1 END) = 2', {
        ids: [userId1, userId2],
      })
      .having('COUNT(member.id) = 2')
      .getOne();

    if (existing) return this.getRoomById(existing.id);

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

    // Attach last message to each room
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
  ): Promise<Message> {
    const message = this.messagesRepo.create({
      content,
      type,
      fileUrl,
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
}
