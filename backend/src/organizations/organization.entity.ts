import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /** Identifiant lisible, unique : sert aux invitations et aux URL. */
  @Index({ unique: true })
  @Column()
  slug: string;

  /**
   * Domaines de messagerie qui rejoignent l'organisation sans invitation
   * nominative, par ex. `acme.com`. Vide = invitation obligatoire.
   */
  @Column({ type: 'simple-array', nullable: true })
  allowedDomains: string[];

  @OneToMany(() => User, (user) => user.organization)
  members: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
