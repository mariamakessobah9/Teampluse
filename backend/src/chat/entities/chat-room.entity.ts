import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Organization } from '../../organizations/organization.entity';
import { Message } from './message.entity';

@Entity('chat_rooms')
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name: string;

  @Column({ default: 'direct' }) // 'direct' | 'group'
  type: string;

  /**
   * Canal ouvert : visible de toute l'organisation et rejoignable sans
   * invitation. N'a de sens que pour `type = 'group'`.
   */
  @Column({ default: false })
  isPublic: boolean;

  /** Sujet du canal, affiche dans la liste de decouverte. */
  @Column({ nullable: true })
  description: string;

  /**
   * Nullable pour les salons anterieurs aux organisations ; renseigne a la
   * creation depuis l'organisation de l'auteur. Indispensable a la decouverte
   * des canaux, qui doit rester cloisonnee.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

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
