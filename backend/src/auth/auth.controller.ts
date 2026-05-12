import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OtpDto, VerifyOtpDto } from './dto/otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('send-otp')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async sendOtp(@Body() dto: OtpDto) {
    return this.authService.sendOtp(dto.email);
  }

  @Post('verify-otp')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.email, dto.otp);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.otp, dto.newPassword);
  }
}
