import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { OrgRole, roleAtLeast } from '../../organizations/org-role.enum';

/**
 * Applique le role minimum pose par `@MinRole`. A placer apres JwtAuthGuard,
 * dont il consomme `request.user`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<OrgRole | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const user = context.switchToHttp().getRequest().user as
      | { role?: string; organizationId?: string | null }
      | undefined;

    if (!user?.organizationId) {
      throw new ForbiddenException('Compte rattache a aucune organisation.');
    }
    if (!roleAtLeast(user.role ?? '', required)) {
      throw new ForbiddenException(
        `Role ${required} requis pour cette action.`,
      );
    }
    return true;
  }
}
