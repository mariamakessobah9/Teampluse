import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Call } from './call.entity';
import { CallParticipant } from './call-participant.entity';

export interface RecordParticipantInput {
  userId: string;
  /** 'joined' | 'declined' | 'missed' */
  status: string;
  isInitiator: boolean;
  /** Temps de presence effectif, en secondes. */
  duration: number;
}

export interface RecordCallInput {
  callerId: string;
  /** Nul pour un appel de groupe. */
  calleeId: string | null;
  mode: 'direct' | 'group';
  chatRoomId: string | null;
  type: string;
  status: string;
  duration?: number;
  participants: RecordParticipantInput[];
}

@Injectable()
export class CallsService {
  constructor(
    @InjectRepository(Call)
    private readonly callsRepo: Repository<Call>,
    @InjectRepository(CallParticipant)
    private readonly participantsRepo: Repository<CallParticipant>,
  ) {}

  async record(input: RecordCallInput): Promise<Call> {
    const call = this.callsRepo.create({
      callerId: input.callerId,
      calleeId: input.calleeId,
      mode: input.mode,
      chatRoomId: input.chatRoomId,
      type: input.type,
      status: input.status,
      duration: input.duration ?? 0,
      // `cascade: true` sur la relation : les participants sont ecrits dans
      // la meme operation que l'appel, donc jamais d'appel orphelin dans
      // l'historique si l'insertion des lignes filles echoue.
      participants: input.participants.map((p) =>
        this.participantsRepo.create({
          userId: p.userId,
          status: p.status,
          isInitiator: p.isInitiator,
          duration: p.duration,
        }),
      ),
    });
    return this.callsRepo.save(call);
  }

  /**
   * Historique d'un utilisateur.
   *
   * L'appartenance se lit dans `call_participants` et non dans les colonnes
   * `caller_id` / `callee_id` : un appel de groupe n'a pas de destinataire
   * unique, et la migration a reporte les anciens appels directs dans cette
   * table pour que la lecture reste uniforme.
   */
  async getHistory(userId: string): Promise<Call[]> {
    // Les identifiants d'abord, puis un `find` : un QueryBuilder ignore les
    // relations `eager`, et l'historique a besoin des profils des
    // participants pour s'afficher. Le tri se fait des cette requete, sinon
    // une troncature a 100 rendrait des appels arbitraires plutot que les
    // plus recents.
    const rows = await this.participantsRepo
      .createQueryBuilder('participant')
      .select('participant.call_id', 'callId')
      .innerJoin('calls', 'call', 'call.id = participant.call_id')
      .where('participant.user_id = :userId', { userId })
      .orderBy('call.createdAt', 'DESC')
      .limit(100)
      .getRawMany<{ callId: string }>();

    const ids = rows.map((r) => r.callId);
    if (ids.length === 0) return [];

    const calls = await this.callsRepo.find({
      where: { id: In(ids) },
      order: { createdAt: 'DESC' },
    });
    return calls.filter((c) => !(c.deletedFor || []).includes(userId));
  }

  async deleteForUser(userId: string, ids: string[]): Promise<void> {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const calls = await this.callsRepo.find({ where: { id: In(ids) } });
    const touched: Call[] = [];
    for (const call of calls) {
      // Only a participant can remove a call from their own history.
      const isParticipant = (call.participants ?? []).some(
        (p) => p.userId === userId,
      );
      if (!isParticipant) continue;
      const deletedFor = new Set(call.deletedFor || []);
      deletedFor.add(userId);
      call.deletedFor = [...deletedFor];
      touched.push(call);
    }
    if (touched.length) await this.callsRepo.save(touched);
  }
}
