import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { ChatRoom } from '../chat/entities/chat-room.entity';
import { CallParticipant } from './call-participant.entity';

@Entity('calls')
// Call history is queried per participant, most-recent first
@Index(['callerId', 'createdAt'])
@Index(['calleeId', 'createdAt'])
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'caller_id' })
  caller: User;

  @Column({ name: 'caller_id' })
  callerId: string;

  /**
   * Destinataire d'un appel direct. Nul pour un appel de groupe, ou les
   * participants sont portes par `call_participants` : la colonne est
   * conservee pour l'historique deja enregistre et pour garder la lecture
   * d'un appel a deux directe, sans jointure.
   */
  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'callee_id' })
  callee: User | null;

  @Column({ name: 'callee_id', type: 'uuid', nullable: true })
  calleeId: string | null;

  @Column({ default: 'direct' }) // 'direct' | 'group'
  mode: string;

  /**
   * Salon a l'origine d'un appel de groupe. Nul pour un appel direct ou pour
   * un groupe ad hoc monte depuis l'ecran « Nouvel appel ».
   */
  @Index()
  @Column({ name: 'chat_room_id', type: 'uuid', nullable: true })
  chatRoomId: string | null;

  @ManyToOne(() => ChatRoom, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'chat_room_id' })
  chatRoom: ChatRoom | null;

  @OneToMany(() => CallParticipant, (participant) => participant.call, {
    eager: true,
    cascade: true,
  })
  participants: CallParticipant[];

  @Column({ default: 'audio' }) // 'audio' | 'video'
  type: string;

  @Column({ default: 'missed' }) // 'completed' | 'missed' | 'rejected'
  status: string;

  @Column({ type: 'integer', default: 0 })
  duration: number; // seconds

  @Column({ type: 'simple-array', nullable: true })
  deletedFor: string[];

  @CreateDateColumn()
  createdAt: Date;
}
