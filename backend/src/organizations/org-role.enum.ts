/**
 * Roles au sein d'une organisation, du plus fort au plus faible.
 *
 * `owner` est unique et ne peut pas etre retire par un autre compte : sans
 * cette garantie, deux administrateurs pourraient se destituer mutuellement et
 * laisser l'organisation sans responsable.
 */
export enum OrgRole {
  Owner = 'owner',
  Admin = 'admin',
  Member = 'member',
}

const RANK: Record<OrgRole, number> = {
  [OrgRole.Owner]: 3,
  [OrgRole.Admin]: 2,
  [OrgRole.Member]: 1,
};

export const isOrgRole = (value: unknown): value is OrgRole =>
  typeof value === 'string' && value in RANK;

/** Vrai si `role` est au moins aussi eleve que `required`. */
export const roleAtLeast = (role: string, required: OrgRole): boolean =>
  (RANK[role as OrgRole] ?? 0) >= RANK[required];
