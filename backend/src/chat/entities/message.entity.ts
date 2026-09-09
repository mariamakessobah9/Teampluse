import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { ChatRoom } from './chat-room.entity';

@Entity('messages')
// Room message list + last-message lookup (ORDER BY createdAt within a room)
@Index(['chatRoomId', 'createdAt'])
// Unread count + markMessagesAsRead (filter by room + status)
@Index(['chatRoomId', 'status'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ default: 'text' }) // 'text' | 'image' | 'file' | 'voice'
  type: string;

  @Column({ nullable: true })
  fileUrl: string;

  @Column({ nullable: true })
  fileName: string;

  @Column({ type: 'integer', nullable: true })
  fileSize: number;

  @Column({ type: 'float', nullable: true })
  duration: number;

  @Column({ default: 'sent' }) // 'sent' | 'delivered' | 'read'
  status: string;

  @Column({ default: false })
  deletedForEveryone: boolean;

  @Column({ type: 'simple-array', nullable: true })
  deletedFor: string[];

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'sender_id' })
  senderId: string;

  @ManyToOne(() => ChatRoom, (room) => room.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chat_room_id' })
  chatRoom: ChatRoom;

  @Column({ name: 'chat_room_id' })
  chatRoomId: string;

  @CreateDateColumn()
  createdAt: Date;
}
