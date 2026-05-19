import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Call } from './call.entity';

export interface RecordCallInput {
  callerId: string;
  calleeId: string;
  type: string;
  status: string;
  duration?: number;
}

@Injectable()
export class CallsService {
  constructor(
    @InjectRepository(Call)
    private readonly callsRepo: Repository<Call>,
  ) {}

  async record(input: RecordCallInput): Promise<Call> {
    const call = this.callsRepo.create({
      callerId: input.callerId,
      calleeId: input.calleeId,
      type: input.type,
      status: input.status,
      duration: input.duration ?? 0,
    });
    return this.callsRepo.save(call);
  }

  async getHistory(userId: string): Promise<Call[]> {
    const calls = await this.callsRepo.find({
      where: [{ callerId: userId }, { calleeId: userId }],
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return calls.filter((c) => !(c.deletedFor || []).includes(userId));
  }

  async deleteForUser(userId: string, ids: string[]): Promise<void> {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const calls = await this.callsRepo.find({ where: { id: In(ids) } });
    for (const call of calls) {
      // Only a participant can remove a call from their own history.
      if (call.callerId !== userId && call.calleeId !== userId) continue;
      const deletedFor = new Set(call.deletedFor || []);
      deletedFor.add(userId);
      call.deletedFor = [...deletedFor];
    }
    await this.callsRepo.save(calls);
  }
}
