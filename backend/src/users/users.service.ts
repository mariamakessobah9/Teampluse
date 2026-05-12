import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';
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
