import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
} from 'typeorm';
import { ChatRoom } from '../chat/entities/chat-room.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ default: 'member' })
  role: string;

  @Column({ default: false })
  isOnline: boolean;

  @Column({ nullable: true })
  otp: string;

  @Column({ nullable: true, type: 'timestamp' })
  otpExpiresAt: Date;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'simple-array', nullable: true })
  pushTokens: string[];

  @Column({ type: 'simple-array', nullable: true })
  pinnedRoomIds: string[];

  @ManyToMany(() => ChatRoom, (room) => room.members)
  chatRooms: ChatRoom[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
