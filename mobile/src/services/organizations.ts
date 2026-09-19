import api from './api';
import {
  Invitation,
  InvitationPreview,
  Organization,
  OrgRole,
  User,
} from '../types';

/** Membre tel que renvoyé par l'annuaire d'administration. */
export type OrgMember = Pick<
  User,
  'id' | 'name' | 'email' | 'avatar' | 'role' | 'isOnline' | 'isVerified'
> & { isActive: boolean; createdAt: string };

export const getOrganization = async (): Promise<Organization> =>
  (await api.get('/organizations/me')).data;

export const updateOrganization = async (patch: {
  name?: string;
  allowedDomains?: string[];
}): Promise<Organization> =>
  (await api.patch('/organizations/me', patch)).data;

export const getMembers = async (): Promise<OrgMember[]> =>
  (await api.get('/organizations/me/members')).data;

export const changeMemberRole = async (
  userId: string,
  role: OrgRole,
): Promise<OrgMember> =>
  (await api.patch(`/organizations/me/members/${userId}/role`, { role })).data;

export const setMemberActive = async (
  userId: string,
  active: boolean,
): Promise<OrgMember> =>
  (
    await api.post(
      `/organizations/me/members/${userId}/${active ? 'reactivate' : 'deactivate'}`,
    )
  ).data;

export const transferOwnership = async (userId: string): Promise<void> => {
  await api.post('/organizations/me/transfer-ownership', { userId });
};

export const getInvitations = async (): Promise<Invitation[]> =>
  (await api.get('/organizations/me/invitations')).data;

export const inviteMember = async (
  email: string,
  role: OrgRole = 'member',
): Promise<Invitation> =>
  (await api.post('/organizations/me/invitations', { email, role })).data;

export const revokeInvitation = async (id: string): Promise<void> => {
  await api.delete(`/organizations/me/invitations/${id}`);
};

/**
 * Consultable sans être connecté : sert à afficher le nom de l'organisation
 * avant que la personne ne crée son compte.
 */
export const previewInvitation = async (
  token: string,
): Promise<InvitationPreview> =>
  (await api.get(`/invitations/${encodeURIComponent(token.trim())}`)).data;
