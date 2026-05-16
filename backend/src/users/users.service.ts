import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Not, Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.usersRepo.create(data);
    return this.usersRepo.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.usersRepo.update(id, data);
    return this.findById(id);
  }

  async setOnlineStatus(id: string, isOnline: boolean): Promise<void> {
    await this.usersRepo.update(id, { isOnline });
  }

  async addPushToken(id: string, token: string): Promise<void> {
    if (!token) return;
    const user = await this.findById(id);
    const tokens = new Set(user.pushTokens || []);
    tokens.add(token);
    await this.usersRepo.update(id, { pushTokens: [...tokens] });
  }

  async removePushToken(id: string, token: string): Promise<void> {
    const user = await this.findById(id);
    const tokens = (user.pushTokens || []).filter((t) => t !== token);
    await this.usersRepo.update(id, { pushTokens: tokens });
  }

  async getPushTokens(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const users = await this.usersRepo.find({
      where: { id: In(userIds) },
      select: ['id', 'pushTokens'],
    });
    return users.flatMap((u) => u.pushTokens || []);
  }

  async getPinnedRoomIds(userId: string): Promise<string[]> {
    const user = await this.findById(userId);
    return user.pinnedRoomIds || [];
  }

  async pinRoom(userId: string, roomId: string): Promise<void> {
    const user = await this.findById(userId);
    const pinned = new Set(user.pinnedRoomIds || []);
    pinned.add(roomId);
    await this.usersRepo.update(userId, { pinnedRoomIds: [...pinned] });
  }

  async unpinRoom(userId: string, roomId: string): Promise<void> {
    const user = await this.findById(userId);
    const pinned = (user.pinnedRoomIds || []).filter((id) => id !== roomId);
    await this.usersRepo.update(userId, { pinnedRoomIds: pinned });
  }

  async pruneTokens(deadTokens: string[]): Promise<void> {
    if (deadTokens.length === 0) return;
    const dead = new Set(deadTokens);
    const users = await this.usersRepo
      .createQueryBuilder('user')
      .select(['user.id', 'user.pushTokens'])
      .where('user.pushTokens IS NOT NULL')
      .getMany();
    for (const user of users) {
      const current = user.pushTokens || [];
      const remaining = current.filter((t) => !dead.has(t));
      if (remaining.length !== current.length) {
        await this.usersRepo.update(user.id, { pushTokens: remaining });
      }
    }
  }

  async remove(id: string): Promise<void> {
    await this.usersRepo.delete(id);
  }

  async search(query: string, excludeId: string): Promise<Partial<User>[]> {
    const q = query?.trim();
    if (!q || q.length < 2) return [];
    const pattern = `%${q}%`;
    const users = await this.usersRepo.find({
      where: [
        { id: Not(excludeId), isVerified: true, name: ILike(pattern) },
        { id: Not(excludeId), isVerified: true, email: ILike(pattern) },
      ],
      select: ['id', 'name', 'email', 'avatar', 'isOnline'],
      take: 20,
      order: { name: 'ASC' },
    });
    return users;
  }
}
