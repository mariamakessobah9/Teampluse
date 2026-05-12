import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { MailService, OtpPurpose } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
    });

    // Génère et stocke l'OTP en synchrone, mais on envoie l'email en arrière-plan
    // pour ne pas bloquer la réponse HTTP (Gmail SMTP peut prendre 5-15s à froid).
    const otp = await this.persistOtp(user.id);
    this.mailService
      .sendOtp(user.email, otp, 'verify')
      .catch((err) =>
        this.logger.error(
          `register: échec envoi OTP à ${user.email}: ${(err as Error).message}`,
        ),
      );

    return {
      message: 'Account created. Check your email for the verification code.',
      email: user.email,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isVerified) {
      this.fireAndForgetOtp(user.id, user.email, 'verify');
      throw new ForbiddenException({
        message: 'Email not verified. A new code has been sent.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    const token = this.generateToken(user.id, user.email);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
      token,
    };
  }

  async sendOtp(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');

    this.fireAndForgetOtp(user.id, user.email, 'verify');
    return { message: 'OTP sent successfully' };
  }

  async verifyOtp(email: string, otp: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      throw new UnauthorizedException('OTP expired');
    }

    await this.usersService.update(user.id, {
      isVerified: true,
      otp: null,
      otpExpiresAt: null,
    });

    const token = this.generateToken(user.id, user.email);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
      token,
    };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    // ne pas révéler l'existence d'un compte
    if (user) {
      this.fireAndForgetOtp(user.id, user.email, 'reset');
    }
    return { message: 'If an account exists, a reset code has been sent.' };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      throw new UnauthorizedException('OTP expired');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.usersService.update(user.id, {
      password: hashed,
      otp: null,
      otpExpiresAt: null,
      isVerified: true,
    });

    const token = this.generateToken(user.id, user.email);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
      token,
    };
  }

  private async persistOtp(userId: string): Promise<string> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.usersService.update(userId, { otp, otpExpiresAt });
    return otp;
  }

  private fireAndForgetOtp(userId: string, email: string, purpose: OtpPurpose) {
    this.persistOtp(userId)
      .then((otp) => this.mailService.sendOtp(email, otp, purpose))
      .catch((err) =>
        this.logger.error(
          `Échec envoi OTP (${purpose}) à ${email}: ${(err as Error).message}`,
        ),
      );
  }

  private generateToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }
}
