import {
  Body,
  Controller,
  Delete,
  Get,
  UseGuards,
} from '@nestjs/common';
import { CallsService } from './calls.service';
import { IceService } from './ice.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly iceService: IceService,
  ) {}

  /**
   * Config ICE du client. Authentifiee : les identifiants TURN ephemeres
   * sont derives de l'identifiant utilisateur et ne doivent pas etre
   * distribuables anonymement.
   */
  @Get('ice-servers')
  getIceServers(@CurrentUser('id') userId: string) {
    return this.iceService.forUser(userId);
  }

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
