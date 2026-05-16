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
    @Body() body: { name?: string; avatar?: string | null },
  ) {
    const patch: { name?: string; avatar?: string | null } = {};
    if (typeof body.name === 'string' && body.name.trim())
      patch.name = body.name.trim();
    if (body.avatar !== undefined) patch.avatar = body.avatar || null;
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
    @CurrentUser('id') currentId: string,
    @Query('q') q: string,
  ) {
    return this.usersService.search(q, currentId);
  }

  @Get('profile/:id')
  async getProfile(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    const { password, otp, otpExpiresAt, ...result } = user;
    return result;
  }
}
