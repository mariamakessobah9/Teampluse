import { Controller, Get, Param, UseGuards } from '@nestjs/common';
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

  @Get('profile/:id')
  async getProfile(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    const { password, otp, otpExpiresAt, ...result } = user;
    return result;
  }
}
