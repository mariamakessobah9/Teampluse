import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { toPublicUser } from './user.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() current: { id: string }) {
    return toPublicUser(await this.usersService.findById(current.id));
  }

  @Patch('me')
  async updateMe(
    @CurrentUser('id') currentId: string,
    @Body()
    body: { name?: string; avatar?: string | null; phone?: string | null },
  ) {
    const patch: {
      name?: string;
      avatar?: string | null;
      phone?: string | null;
    } = {};
    if (typeof body.name === 'string' && body.name.trim())
      patch.name = body.name.trim();
    if (body.avatar !== undefined) patch.avatar = body.avatar || null;
    if (body.phone !== undefined)
      patch.phone = body.phone ? body.phone.trim() : null;
    return toPublicUser(await this.usersService.update(currentId, patch));
  }

  @Post('push-token')
  async addPushToken(
    @CurrentUser('id') currentId: string,
    @Body('token') token: string,
  ) {
    await this.usersService.addPushToken(currentId, token);
    return { ok: true };
  }

  @Delete('push-token')
  async removePushToken(
    @CurrentUser('id') currentId: string,
    @Body('token') token: string,
  ) {
    await this.usersService.removePushToken(currentId, token);
    return { ok: true };
  }

  @Get('search')
  async search(
    @CurrentUser() current: { id: string; organizationId: string | null },
    @Query('q') q: string,
  ) {
    return this.usersService.search(q, current.id, current.organizationId);
  }

  /**
   * Suppression definitive du compte par son titulaire. Exigee par Google
   * Play ; le mot de passe est redemande pour eviter qu'un telephone
   * deverrouille suffise.
   */
  @Delete('me')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async deleteMe(
    @CurrentUser('id') currentId: string,
    @Body('password') password: string,
  ) {
    await this.usersService.deleteAccount(currentId, password);
    return { ok: true };
  }

  @Get('profile/:id')
  async getProfile(
    @CurrentUser() current: { organizationId: string | null },
    @Param('id') id: string,
  ) {
    return toPublicUser(
      await this.usersService.findInOrganization(id, current.organizationId),
    );
  }
}
