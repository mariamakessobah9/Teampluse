import {
  BadRequestException,
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
import { OrganizationsService } from '../organizations/organizations.service';
import { OrgRole } from '../organizations/org-role.enum';
import { User } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly organizations: OrganizationsService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    const { organizationId, role, invitationId } =
      await this.resolveOrganization(dto);

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      organizationId,
      role,
    });

    // Apres la creation seulement : si celle-ci echoue, l'invitation reste
    // utilisable plutot que d'etre consommee dans le vide.
    if (invitationId) await this.organizations.markAccepted(invitationId);

    // Le compte trouve #general des sa premiere ouverture, au lieu d'un ecran
    // vide. Non bloquant : un echec ici ne doit pas annuler l'inscription.
    await this.organizations
      .joinPublicChannels(organizationId, user)
      .catch((err) =>
        this.logger.error(
          `register: rattachement aux canaux ouverts impossible pour ${user.email}: ${(err as Error).message}`,
        ),
      );

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

  /**
   * Trois chemins d'entree, par ordre de priorite : une invitation nominative,
   * la creation d'une organisation, puis le rattachement automatique par
   * domaine de messagerie. Aucun des trois ne s'appliquant, on refuse plutot
   * que de creer un compte flottant, sans equipe ni annuaire.
   */
  private async resolveOrganization(dto: RegisterDto): Promise<{
    organizationId: string;
    role: OrgRole;
    invitationId?: string;
  }> {
    if (dto.invitationToken) {
      const invitation = await this.organizations.usableInvitation(
        dto.invitationToken,
      );
      if (!invitation) {
        throw new BadRequestException('Invitation invalide ou expiree');
      }
      // Sinon un code fuite permettrait d'entrer avec n'importe quelle adresse.
      if (invitation.email !== dto.email.trim().toLowerCase()) {
        throw new ForbiddenException(
          `Cette invitation est reservee a ${invitation.email}.`,
        );
      }
      return {
        organizationId: invitation.organizationId,
        role: invitation.role as OrgRole,
        invitationId: invitation.id,
      };
    }

    if (dto.organizationName) {
      const org = await this.organizations.create(dto.organizationName);
      return { organizationId: org.id, role: OrgRole.Owner };
    }

    const byDomain = await this.organizations.findByEmailDomain(dto.email);
    if (byDomain) {
      return { organizationId: byDomain.id, role: OrgRole.Member };
    }

    throw new BadRequestException({
      message:
        "Indiquez le nom de votre organisation pour la creer, ou saisissez le code d'invitation recu.",
      code: 'ORGANIZATION_REQUIRED',
    });
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // Verifie avant l'etat de verification : un compte revoque ne doit pas
    // pouvoir relancer un OTP et deviner qu'il existe encore.
    this.assertActive(user);

    if (!user.isVerified) {
      this.fireAndForgetOtp(user.id, user.email, 'verify');
      throw new ForbiddenException({
        message: 'Email not verified. A new code has been sent.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    return this.session(user);
  }

  async sendOtp(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    this.assertActive(user);

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
    this.assertActive(user);

    await this.usersService.update(user.id, {
      isVerified: true,
      otp: null,
      otpExpiresAt: null,
    });

    return this.session(user);
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    // ne pas révéler l'existence d'un compte, ni qu'il a été désactivé
    if (user && user.isActive !== false) {
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
    this.assertActive(user);

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.usersService.update(user.id, {
      password: hashed,
      otp: null,
      otpExpiresAt: null,
      isVerified: true,
    });

    return this.session(user);
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

  /**
   * Le jeton porte l'organisation et le role : les gardes evitent ainsi une
   * lecture supplementaire a chaque requete. Le role reste verifie en base
   * par JwtStrategy, sans quoi une retrogradation n'aurait d'effet qu'a
   * l'expiration du jeton.
   */
  private generateToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    });
  }

  private session(user: User) {
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        organizationId: user.organizationId,
      },
      token: this.generateToken(user),
    };
  }

  /** Refuse un compte revoque par un administrateur. */
  private assertActive(user: User): void {
    if (user.isActive === false) {
      throw new ForbiddenException({
        message:
          "Ce compte a ete desactive par un administrateur de votre organisation.",
        code: 'ACCOUNT_DEACTIVATED',
      });
    }
  }
}
