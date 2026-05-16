import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('calls')
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'caller_id' })
  caller: User;

  @Column({ name: 'caller_id' })
  callerId: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'callee_id' })
  callee: User;

  @Column({ name: 'callee_id' })
  calleeId: string;

  @Column({ default: 'audio' }) // 'audio' | 'video'
  type: string;

  @Column({ default: 'missed' }) // 'completed' | 'missed' | 'rejected'
  status: string;

  @Column({ type: 'integer', default: 0 })
  duration: number; // seconds

  @CreateDateColumn()
  createdAt: Date;
}
