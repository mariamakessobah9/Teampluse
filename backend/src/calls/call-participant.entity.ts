import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Call } from './call.entity';

/**
 * Presence d'un utilisateur dans un appel.
 *
 * Un appel de groupe n'a plus un destinataire unique : chaque membre a son
 * propre sort (il decroche, refuse, ou laisse sonner) et sa propre duree,
 * puisqu'on peut rejoindre un appel en cours ou le quitter avant les autres.
 * L'historique doit donc pouvoir dire « Amina a participe 4 min, Karim n'a
 * jamais repondu », ce qu'une paire de colonnes sur `calls` ne permet pas.
 */
@Entity('call_participants')
// Un utilisateur n'apparait qu'une fois par appel : re-rejoindre met a jour
// la ligne existante plutot que d'en empiler une seconde.
@Unique('UQ_call_participant', ['callId', 'userId'])
// L'historique se lit par utilisateur, du plus recent au plus ancien.
@Index(['userId', 'callId'])
export class CallParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Call, (call) => call.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'call_id' })
  call: Call;

  @Column({ name: 'call_id' })
  callId: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  /**
   * 'joined'    a effectivement participe
   * 'declined'  a refuse explicitement
   * 'missed'    a laisse sonner, ou n'etait pas joignable
   */
  @Column({ default: 'missed' })
  status: string;

  /** Initiateur de l'appel. Toujours exactement un par appel. */
  @Column({ name: 'is_initiator', default: false })
  isInitiator: boolean;

  /** Temps de presence effectif, en secondes. 0 s'il n'a jamais rejoint. */
  @Column({ type: 'integer', default: 0 })
  duration: number;
}
