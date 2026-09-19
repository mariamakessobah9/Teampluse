import { SetMetadata } from '@nestjs/common';
import { OrgRole } from '../../organizations/org-role.enum';

export const ROLES_KEY = 'minimumOrgRole';

/**
 * Role minimum requis sur la route. `@MinRole(OrgRole.Admin)` laisse donc
 * passer un `owner` : les roles sont hierarchiques, pas exclusifs.
 */
export const MinRole = (role: OrgRole) => SetMetadata(ROLES_KEY, role);
