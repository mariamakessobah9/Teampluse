import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    return this.callsRepo.find({
      where: [{ callerId: userId }, { calleeId: userId }],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
