import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrganizationsService } from './organizations.service';
import { OrgRole } from './org-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { MinRole } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MailService } from '../mail/mail.service';

type Actor = { id: string; role: string; organizationId: string };

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly mail: MailService,
  ) {}

  @Get('me')
  async current(@CurrentUser() actor: Actor) {
    return this.orgs.findById(actor.organizationId);
  }

  @Patch('me')
  @MinRole(OrgRole.Admin)
  async update(
    @CurrentUser() actor: Actor,
    @Body() body: { name?: string; allowedDomains?: string[] },
  ) {
    return this.orgs.update(actor.organizationId, body);
  }

  // --- Membres -------------------------------------------------------------

  @Get('me/members')
  async members(@CurrentUser() actor: Actor) {
    return this.orgs.members(actor.organizationId);
  }

  @Patch('me/members/:userId/role')
  @MinRole(OrgRole.Admin)
  async changeRole(
    @CurrentUser() actor: Actor,
    @Param('userId') userId: string,
    @Body('role') role: string,
  ) {
    return this.orgs.changeRole(actor.organizationId, actor, userId, role);
  }

  @Post('me/members/:userId/deactivate')
  @MinRole(OrgRole.Admin)
  async deactivate(
    @CurrentUser() actor: Actor,
    @Param('userId') userId: string,
  ) {
    return this.orgs.setActive(actor.organizationId, actor, userId, false);
  }

  @Post('me/members/:userId/reactivate')
  @MinRole(OrgRole.Admin)
  async reactivate(
    @CurrentUser() actor: Actor,
    @Param('userId') userId: string,
  ) {
    return this.orgs.setActive(actor.organizationId, actor, userId, true);
  }

  @Post('me/transfer-ownership')
  @MinRole(OrgRole.Owner)
  async transferOwnership(
    @CurrentUser() actor: Actor,
    @Body('userId') userId: string,
  ) {
    return this.orgs.transferOwnership(actor.organizationId, actor.id, userId);
  }

  // --- Invitations ---------------------------------------------------------

  @Get('me/invitations')
  @MinRole(OrgRole.Admin)
  async invitations(@CurrentUser() actor: Actor) {
    return this.orgs.pendingInvitations(actor.organizationId);
  }

  @Post('me/invitations')
  @MinRole(OrgRole.Admin)
  // L'envoi d'e-mail est couteux et abusable : on borne plus court que le
  // reste de l'API.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async invite(
    @CurrentUser() actor: Actor,
    @Body() body: { email: string; role?: string },
  ) {
    const invitation = await this.orgs.invite(
      actor.organizationId,
      actor.id,
      body.email,
      body.role,
    );
    const org = await this.orgs.findById(actor.organizationId);

    // Envoi en arriere-plan, comme les OTP : l'invitation est deja persistee
    // et le jeton reste recuperable dans la liste des invitations en attente.
    this.mail
      .sendInvitation(invitation.email, org.name, invitation.token)
      .catch(() => undefined);

    return invitation;
  }

  @Delete('me/invitations/:id')
  @MinRole(OrgRole.Admin)
  async revoke(@CurrentUser() actor: Actor, @Param('id') id: string) {
    return this.orgs.revokeInvitation(actor.organizationId, id);
  }
}
