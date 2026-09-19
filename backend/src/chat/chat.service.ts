import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  /**
   * Canaux ouverts de l'organisation que cette personne n'a pas encore
   * rejoints. C'est la liste de decouverte : sans elle, un nouvel arrivant
   * n'a aucun moyen de trouver les conversations de son equipe.
   */
  async discoverableChannels(
    organizationId: string | null,
    userId: string,
  ): Promise<ChatRoom[]> {
    if (!organizationId) return [];
    const channels = await this.roomsRepo.find({
      where: { organizationId, type: 'group', isPublic: true },
      relations: ['members'],
      order: { name: 'ASC' },
    });
    return channels.filter((c) => !c.members.some((m) => m.id === userId));
  }

  /**
   * Rejoindre un canal ouvert de sa propre organisation, sans invitation.
   * Un salon prive ou appartenant a une autre organisation reste inaccessible.
   */
  async joinChannel(
    roomId: string,
    userId: string,
    organizationId: string | null,
  ): Promise<ChatRoom> {
    const room = await this.getRoomById(roomId);
    if (
      room.type !== 'group' ||
      !room.isPublic ||
      !organizationId ||
      room.organizationId !== organizationId
    ) {
      throw new ForbiddenException("Ce canal n'est pas ouvert a votre organisation.");
    }
    if (room.members.some((m) => m.id === userId)) return room;

    room.members.push(await this.usersService.findById(userId));
    return this.roomsRepo.save(room);
  }

  /**
   * Recherche plein texte dans les conversations de la personne uniquement.
   * Le filtre part de l'appartenance aux salons, pas de l'organisation : un
   * groupe prive dont on ne fait pas partie ne doit pas ressortir, meme entre
   * collegues.
   */
  async searchMessages(
    userId: string,
    query: string,
    limit = 40,
  ): Promise<Message[]> {
    const q = query?.trim();
    if (!q || q.length < 2) return [];

    const messages = await this.messagesRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .leftJoinAndSelect('m.chatRoom', 'room')
      .leftJoinAndSelect('room.members', 'roomMembers')
      // Restreint aux salons dont l'utilisateur est membre.
      .where((qb) => {
        const sub = qb
          .subQuery()
          .select('cm.chat_room_id')
          .from('chat_room_members', 'cm')
          .where('cm.user_id = :userId')
          .getQuery();
        return `m.chat_room_id IN ${sub}`;
      })
      .andWhere('m.deletedForEveryone = false')
      .andWhere('m.content ILIKE :pattern')
      // Les pieces jointes n'ont pas de texte utile a indexer.
      .andWhere("m.type = 'text'")
      .setParameters({ userId, pattern: `%${q}%` })
      .orderBy('m.createdAt', 'DESC')
      // On lit un peu plus que demande : les messages effaces cote
      // utilisateur sont retires ensuite, `deletedFor` etant un simple-array
      // que SQL ne sait pas filtrer proprement.
      .take(limit * 2)
      .getMany();

    return messages
      .filter((m) => !(m.deletedFor || []).includes(userId))
      .slice(0, limit);
  }

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
      // Les deux membres sont de la meme organisation, le controleur l'a
      // verifie avant d'arriver ici.
      organizationId: user1.organizationId,
      members: [user1, user2],
    });

    return this.roomsRepo.save(room);
  }

  async createGroupRoom(
    name: string,
    adminId: string,
    memberIds: string[],
    options: { isPublic?: boolean; description?: string } = {},
  ): Promise<ChatRoom> {
    const allIds = [...new Set([adminId, ...memberIds])];
    const members = await Promise.all(
      allIds.map((id) => this.usersService.findById(id)),
    );
    const admin = members.find((m) => m.id === adminId);

    const room = this.roomsRepo.create({
      name,
      type: 'group',
      adminId,
      isPublic: Boolean(options.isPublic),
      description: options.description?.trim() || null,
      organizationId: admin?.organizationId ?? null,
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

    const pinnedIds = new Set(
      await this.usersService.getPinnedRoomIds(userId),
    );

    if (rooms.length === 0) return [];
    const roomIds = rooms.map((r) => r.id);

    // Last message per room in a single query (Postgres DISTINCT ON),
    // instead of one findOne per room.
    const lastMessages = await this.messagesRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .distinctOn(['m.chat_room_id'])
      .where('m.chatRoomId IN (:...roomIds)', { roomIds })
      .orderBy('m.chat_room_id', 'ASC')
      .addOrderBy('m.createdAt', 'DESC')
      .getMany();
    const lastMessageByRoom = new Map(
      lastMessages.map((m) => [m.chatRoomId, m]),
    );

    // Unread counts for all rooms in a single grouped query,
    // instead of one count() per room.
    const unreadRows = await this.messagesRepo
      .createQueryBuilder('m')
      .select('m.chatRoomId', 'roomId')
      .addSelect('COUNT(*)', 'count')
      .where('m.chatRoomId IN (:...roomIds)', { roomIds })
      .andWhere('m.senderId != :userId', { userId })
      .andWhere('m.status IN (:...statuses)', {
        statuses: ['sent', 'delivered'],
      })
      .groupBy('m.chatRoomId')
      .getRawMany<{ roomId: string; count: string }>();
    const unreadByRoom = new Map(
      unreadRows.map((r) => [r.roomId, Number(r.count)]),
    );

    return rooms.map((room) => ({
      ...room,
      lastMessage: lastMessageByRoom.get(room.id) ?? null,
      unreadCount: unreadByRoom.get(room.id) ?? 0,
      isPinned: pinnedIds.has(room.id),
    }));
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
    userId?: string,
  ): Promise<Message[]> {
    const messages = await this.messagesRepo.find({
      where: { chatRoomId },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    if (!userId) return messages;
    return messages.filter(
      (m) => !(m.deletedFor || []).includes(userId),
    );
  }

  async deleteMessageForMe(
    messageId: string,
    userId: string,
  ): Promise<void> {
    const message = await this.messagesRepo.findOne({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    const deletedFor = new Set(message.deletedFor || []);
    deletedFor.add(userId);
    message.deletedFor = [...deletedFor];
    await this.messagesRepo.save(message);
  }

  async deleteMessageForEveryone(
    messageId: string,
    userId: string,
  ): Promise<Message> {
    const message = await this.messagesRepo.findOne({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId)
      throw new ForbiddenException(
        'Only the sender can delete a message for everyone',
      );
    message.deletedForEveryone = true;
    message.content = '';
    message.fileUrl = null;
    message.fileName = null;
    message.fileSize = null;
    message.duration = null;
    return this.messagesRepo.save(message);
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
