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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() current: { id: string }) {
    const user = await this.usersService.findById(current.id);
    const { password, otp, otpExpiresAt, ...result } = user;
    return result;
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
    const updated = await this.usersService.update(currentId, patch);
    const { password, otp, otpExpiresAt, ...result } = updated;
    return result;
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
    const user = await this.usersService.findInOrganization(
      id,
      current.organizationId,
    );
    const { password, otp, otpExpiresAt, ...result } = user;
    return result;
  }
}
