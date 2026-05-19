import {
  Body,
  Controller,
  Delete,
  Get,
  UseGuards,
} from '@nestjs/common';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get()
  async getHistory(@CurrentUser('id') userId: string) {
    return this.callsService.getHistory(userId);
  }

  @Delete()
  async deleteHistory(
    @CurrentUser('id') userId: string,
    @Body('ids') ids: string[],
  ) {
    await this.callsService.deleteForUser(userId, ids);
    return { ok: true };
  }
}
