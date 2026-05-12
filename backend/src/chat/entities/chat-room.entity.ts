import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Message } from './message.entity';

@Entity('chat_rooms')
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name: string;

  @Column({ default: 'direct' }) // 'direct' | 'group'
  type: string;

  @Column({ nullable: true })
  avatar: string;

  @ManyToMany(() => User, (user) => user.chatRooms, { eager: true })
  @JoinTable({
    name: 'chat_room_members',
    joinColumn: { name: 'chat_room_id' },
    inverseJoinColumn: { name: 'user_id' },
  })
  members: User[];

  @Column({ nullable: true, type: 'uuid' })
  adminId: string;

  @OneToMany(() => Message, (message) => message.chatRoom)
  messages: Message[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
