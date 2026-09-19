import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { OrgRole } from './org-role.enum';

@Entity('invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  email: string;

  /** Jeton porte par le lien d'invitation. Unique et non devinable. */
  @Index({ unique: true })
  @Column()
  token: string;

  @Column({ default: OrgRole.Member })
  role: string;

  @Index()
  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column({ type: 'uuid', nullable: true })
  invitedById: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  /** Renseigne au moment ou l'invitation sert : elle n'est plus rejouable. */
  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
