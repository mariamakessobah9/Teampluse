import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ChatRoom } from '../chat/entities/chat-room.entity';
import { Organization } from '../organizations/organization.entity';
import { OrgRole } from '../organizations/org-role.enum';

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

  /** Role dans l'organisation : owner | admin | member (voir OrgRole). */
  @Column({ default: OrgRole.Member })
  role: string;

  /**
   * Nullable uniquement pour les comptes anterieurs a l'introduction des
   * organisations ; OrganizationsService les rattache au demarrage.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  @ManyToOne(() => Organization, (org) => org.members, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  /**
   * Retrait d'acces sans suppression : les messages deja envoyes restent
   * lisibles par l'equipe, mais le compte ne peut plus ni se connecter ni
   * utiliser un jeton encore valide.
   */
  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  deactivatedAt: Date | null;

  /**
   * Compte supprime a la demande de son titulaire. La ligne subsiste parce que
   * `messages.sender_id` la reference, mais toutes les donnees personnelles
   * sont effacees. Distinct de `isActive` : une desactivation est reversible
   * par un administrateur, pas une suppression.
   */
  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

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
