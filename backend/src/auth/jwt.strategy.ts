import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId?: string | null;
  role?: string;
}

/** Ce que les gardes et `@CurrentUser()` recoivent. */
export interface RequestUser {
  id: string;
  email: string;
  organizationId: string | null;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Le role et l'organisation sont relus en base a chaque requete plutot que
   * pris dans le jeton. Un jeton vit sept jours : s'y fier laisserait un
   * compte desactive, retrograde ou sorti de l'organisation continuer a agir
   * pendant tout ce temps.
   */
  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.usersService.findByIdOrNull(payload.sub);
    if (!user) throw new UnauthorizedException('Compte introuvable');
    if (user.isActive === false) {
      throw new UnauthorizedException('Compte desactive');
    }

    return {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId ?? null,
      role: user.role,
    };
  }
}
