import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { CallsService } from './calls.service';
import { LiveKitService } from './livekit.service';
import { CallStateService } from './call-state.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly livekit: LiveKitService,
    private readonly callState: CallStateService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Jeton d'acces a la salle media d'un appel.
   *
   * Servi par l'API plutot qu'embarque dans l'application : il est signe avec
   * le secret LiveKit, qui ne doit jamais quitter le serveur, et il est
   * limite a la salle de cet appel precis.
   *
   * L'appartenance est verifiee dans l'etat partage, pas sur parole du
   * client : sans ce controle, n'importe quel compte authentifie pourrait
   * demander un jeton pour un appel en cours entre deux autres personnes et
   * s'y inviter.
   */
  @Get(':callId/token')
  async getToken(
    @CurrentUser('id') userId: string,
    @Param('callId') callId: string,
  ) {
    if (!this.livekit.isConfigured()) {
      throw new ServiceUnavailableException(
        'Les appels ne sont pas configures sur ce serveur.',
      );
    }

    const call = await this.callState.get(callId);
    if (!call) throw new NotFoundException("Cet appel n'est plus en cours.");

    const participant = call.participants?.[userId];
    if (!participant || participant.state === 'declined') {
      throw new ForbiddenException('Vous ne participez pas a cet appel.');
    }

    const user = await this.usersService.findByIdOrNull(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    return this.livekit.tokenFor(callId, {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
    });
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
