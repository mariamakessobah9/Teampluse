import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrganizationsService } from './organizations.service';

/**
 * Consultation publique d'une invitation : l'application mobile affiche le nom
 * de l'organisation avant que la personne ne cree son compte. Non authentifie
 * par nature — le jeton fait office de preuve.
 */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get(':token')
  // Le jeton est long et aleatoire, mais on borne quand meme l'enumeration.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async preview(@Param('token') token: string) {
    const invitation = await this.orgs.usableInvitation(token);
    if (!invitation) {
      throw new NotFoundException('Invitation invalide ou expiree');
    }
    return {
      email: invitation.email,
      role: invitation.role,
      organizationName: invitation.organization?.name,
      expiresAt: invitation.expiresAt,
    };
  }
}
