import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Organization } from './organization.entity';
import { Invitation } from './invitation.entity';
import { OrgRole, isOrgRole, roleAtLeast } from './org-role.enum';
import { User } from '../users/user.entity';
import { ChatRoom } from '../chat/entities/chat-room.entity';

/** Une invitation non utilisee expire au bout de sept jours. */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const emailDomain = (email: string): string =>
  email.trim().toLowerCase().split('@')[1] ?? '';

@Injectable()
export class OrganizationsService implements OnModuleInit {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    @InjectRepository(Organization)
    private readonly orgsRepo: Repository<Organization>,
    @InjectRepository(Invitation)
    private readonly invitationsRepo: Repository<Invitation>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    // Depot injecte directement plutot que ChatService : les canaux par defaut
    // relevent du cycle de vie de l'organisation, et passer par le module de
    // discussion creerait une dependance circulaire avec l'authentification.
    @InjectRepository(ChatRoom)
    private readonly roomsRepo: Repository<ChatRoom>,
  ) {}

  /** Nom du canal ouvert cree avec chaque organisation. */
  static readonly DEFAULT_CHANNEL = 'general';

  async onModuleInit(): Promise<void> {
    await this.adoptOrphanAccounts();
    await this.backfillDefaultChannels();
  }

  /**
   * Les comptes crees avant l'introduction des organisations n'en ont aucune,
   * ce qui les rendrait incapables de chercher ou d'ecrire a qui que ce soit.
   * On les regroupe dans une organisation de reprise plutot que de les laisser
   * dans cet etat, et le plus ancien en devient responsable.
   */
  private async adoptOrphanAccounts(): Promise<void> {
    const orphans = await this.usersRepo.find({
      where: { organizationId: IsNull(), deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (orphans.length === 0) return;

    const org = await this.findOrCreateBySlug('teampulse', 'TeamPulse');
    await this.usersRepo.update(
      { organizationId: IsNull(), deletedAt: IsNull() },
      { organizationId: org.id, role: OrgRole.Member },
    );
    await this.usersRepo.update(orphans[0].id, { role: OrgRole.Owner });

    this.logger.warn(
      `${orphans.length} compte(s) sans organisation rattache(s) a « ${org.name} » ; ` +
        `${orphans[0].email} en est responsable.`,
    );
  }

  /**
   * Les organisations anterieures aux canaux n'ont pas de `#general`. On le
   * cree et on y inscrit les membres existants — mais uniquement lors de sa
   * creation : en regime etabli le cout se limite a une lecture par
   * organisation au demarrage.
   */
  private async backfillDefaultChannels(): Promise<void> {
    for (const org of await this.orgsRepo.find()) {
      const existing = await this.roomsRepo.findOne({
        where: {
          organizationId: org.id,
          type: 'group',
          name: OrganizationsService.DEFAULT_CHANNEL,
        },
      });
      if (existing) continue;

      await this.ensureDefaultChannel(org.id);
      const members = await this.usersRepo.find({
        where: { organizationId: org.id, deletedAt: IsNull() },
      });
      for (const member of members) {
        await this.joinPublicChannels(org.id, member);
      }
      this.logger.warn(
        `Canal « ${OrganizationsService.DEFAULT_CHANNEL} » cree pour « ${org.name} » ` +
          `avec ${members.length} membre(s).`,
      );
    }
  }

  // --- Organisations -------------------------------------------------------

  async findById(id: string): Promise<Organization> {
    const org = await this.orgsRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organisation introuvable');
    return org;
  }

  /** Organisation acceptant ce domaine de messagerie, s'il en existe une. */
  async findByEmailDomain(email: string): Promise<Organization | null> {
    const domain = emailDomain(email);
    if (!domain) return null;
    // `simple-array` se stocke en texte : on filtre en memoire plutot que
    // d'ecrire un LIKE qui confondrait `acme.com` et `notacme.com`.
    const orgs = await this.orgsRepo.find({
      where: { allowedDomains: Not(IsNull()) },
    });
    return (
      orgs.find((o) => (o.allowedDomains || []).includes(domain)) ?? null
    );
  }

  async create(name: string): Promise<Organization> {
    const clean = name.trim();
    if (!clean) throw new BadRequestException("Nom d'organisation requis");
    const org = this.orgsRepo.create({
      name: clean,
      slug: await this.uniqueSlug(clean),
    });
    const saved = await this.orgsRepo.save(org);

    await this.ensureDefaultChannel(saved.id);
    return saved;
  }

  /**
   * Garantit l'existence du canal d'accueil. Sans lui, un nouvel arrivant
   * ouvre une application vide : rien a lire, personne a qui ecrire tant
   * qu'il n'a pas cherche un nom au hasard.
   */
  async ensureDefaultChannel(organizationId: string): Promise<ChatRoom> {
    const existing = await this.roomsRepo.findOne({
      where: {
        organizationId,
        type: 'group',
        name: OrganizationsService.DEFAULT_CHANNEL,
      },
      relations: ['members'],
    });
    if (existing) return existing;

    return this.roomsRepo.save(
      this.roomsRepo.create({
        name: OrganizationsService.DEFAULT_CHANNEL,
        type: 'group',
        isPublic: true,
        description: 'Canal ouvert a toute l’organisation',
        organizationId,
        members: [],
      }),
    );
  }

  /**
   * Inscrit un nouveau membre aux canaux ouverts de son organisation. Appele a
   * la creation du compte : il trouve ainsi une conversation en arrivant.
   */
  async joinPublicChannels(organizationId: string, user: User): Promise<void> {
    const channels = await this.roomsRepo.find({
      where: { organizationId, type: 'group', isPublic: true },
      relations: ['members'],
    });
    for (const channel of channels) {
      if (channel.members.some((m) => m.id === user.id)) continue;
      channel.members.push(user);
      await this.roomsRepo.save(channel);
    }
  }

  async update(
    orgId: string,
    patch: { name?: string; allowedDomains?: string[] },
  ): Promise<Organization> {
    const org = await this.findById(orgId);
    if (patch.name !== undefined) {
      const clean = patch.name.trim();
      if (!clean) throw new BadRequestException("Nom d'organisation requis");
      org.name = clean;
    }
    if (patch.allowedDomains !== undefined) {
      org.allowedDomains = this.normalizeDomains(patch.allowedDomains);
    }
    return this.orgsRepo.save(org);
  }

  // --- Membres -------------------------------------------------------------

  async members(orgId: string): Promise<Partial<User>[]> {
    return this.usersRepo.find({
      // Un compte supprime garde son organisation pour que ses anciens
      // messages restent rattaches, mais il n'a plus sa place dans l'annuaire.
      where: { organizationId: orgId, deletedAt: IsNull() },
      select: [
        'id',
        'name',
        'email',
        'avatar',
        'role',
        'isActive',
        'isOnline',
        'isVerified',
        'createdAt',
      ],
      order: { name: 'ASC' },
    });
  }

  /**
   * Un administrateur ne peut ni se hisser au rang de responsable, ni toucher
   * a un compte de rang superieur ou egal au sien : seul le responsable
   * redistribue les roles eleves.
   */
  async changeRole(
    orgId: string,
    actor: { id: string; role: string },
    targetId: string,
    nextRole: string,
  ): Promise<Partial<User>> {
    if (!isOrgRole(nextRole)) {
      throw new BadRequestException(`Role inconnu : ${nextRole}`);
    }
    const target = await this.memberOrFail(orgId, targetId);

    if (actor.id === target.id) {
      throw new ForbiddenException('Impossible de modifier son propre role.');
    }
    if (nextRole === OrgRole.Owner || target.role === OrgRole.Owner) {
      throw new ForbiddenException(
        'Le transfert du role de responsable passe par transfer-ownership.',
      );
    }
    if (
      actor.role !== OrgRole.Owner &&
      roleAtLeast(target.role, actor.role as OrgRole)
    ) {
      throw new ForbiddenException(
        'Role insuffisant pour modifier ce compte.',
      );
    }

    await this.usersRepo.update(target.id, { role: nextRole });
    return this.publicMember({ ...target, role: nextRole });
  }

  /** Le responsable cede sa place et redevient administrateur. */
  async transferOwnership(
    orgId: string,
    ownerId: string,
    targetId: string,
  ): Promise<{ ok: true }> {
    const target = await this.memberOrFail(orgId, targetId);
    if (target.id === ownerId) {
      throw new BadRequestException('Ce compte est deja responsable.');
    }
    if (!target.isActive) {
      throw new BadRequestException(
        'Impossible de nommer un compte desactive.',
      );
    }
    await this.usersRepo.update(target.id, { role: OrgRole.Owner });
    await this.usersRepo.update(ownerId, { role: OrgRole.Admin });
    return { ok: true };
  }

  async setActive(
    orgId: string,
    actor: { id: string; role: string },
    targetId: string,
    isActive: boolean,
  ): Promise<Partial<User>> {
    const target = await this.memberOrFail(orgId, targetId);

    if (actor.id === target.id) {
      throw new ForbiddenException(
        'Impossible de desactiver son propre compte.',
      );
    }
    if (target.role === OrgRole.Owner) {
      throw new ForbiddenException(
        'Le responsable ne peut pas etre desactive ; transferez son role.',
      );
    }
    if (
      actor.role !== OrgRole.Owner &&
      roleAtLeast(target.role, actor.role as OrgRole)
    ) {
      throw new ForbiddenException(
        'Role insuffisant pour modifier ce compte.',
      );
    }

    await this.usersRepo.update(target.id, {
      isActive,
      deactivatedAt: isActive ? null : new Date(),
      // Coupe aussi les notifications : un compte revoque ne doit plus
      // recevoir les messages de l'equipe sur son telephone.
      ...(isActive ? {} : { pushTokens: [], isOnline: false }),
    });
    return this.publicMember({ ...target, isActive });
  }

  // --- Invitations ---------------------------------------------------------

  async invite(
    orgId: string,
    invitedById: string,
    email: string,
    role: string = OrgRole.Member,
  ): Promise<Invitation> {
    const clean = email.trim().toLowerCase();
    if (!clean.includes('@')) {
      throw new BadRequestException('Adresse e-mail invalide');
    }
    if (!isOrgRole(role) || role === OrgRole.Owner) {
      throw new BadRequestException('Role invitable : admin ou member');
    }

    const existingUser = await this.usersRepo.findOne({
      where: { email: clean },
    });
    if (existingUser) {
      throw new ConflictException(
        existingUser.organizationId === orgId
          ? 'Ce compte fait deja partie de l’organisation.'
          : 'Cette adresse est deja utilisee par un autre compte.',
      );
    }

    // Une invitation en attente est remplacee plutot que dupliquee : sinon la
    // liste se remplit de doublons a chaque relance.
    await this.invitationsRepo.delete({
      email: clean,
      organizationId: orgId,
      acceptedAt: IsNull(),
    });

    const invitation = this.invitationsRepo.create({
      email: clean,
      organizationId: orgId,
      invitedById,
      role,
      token: randomBytes(24).toString('base64url'),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });
    return this.invitationsRepo.save(invitation);
  }

  async pendingInvitations(orgId: string): Promise<Invitation[]> {
    return this.invitationsRepo.find({
      where: { organizationId: orgId, acceptedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeInvitation(orgId: string, id: string): Promise<{ ok: true }> {
    const res = await this.invitationsRepo.delete({
      id,
      organizationId: orgId,
    });
    if (!res.affected) throw new NotFoundException('Invitation introuvable');
    return { ok: true };
  }

  /** Invitation exploitable, ou null si inconnue, deja utilisee ou expiree. */
  async usableInvitation(token: string): Promise<Invitation | null> {
    if (!token) return null;
    const invitation = await this.invitationsRepo.findOne({
      where: { token },
      relations: ['organization'],
    });
    if (!invitation) return null;
    if (invitation.acceptedAt) return null;
    if (invitation.expiresAt < new Date()) return null;
    return invitation;
  }

  async markAccepted(id: string): Promise<void> {
    await this.invitationsRepo.update(id, { acceptedAt: new Date() });
  }

  // --- Utilitaires ---------------------------------------------------------

  private async memberOrFail(orgId: string, userId: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user || user.organizationId !== orgId) {
      throw new NotFoundException('Membre introuvable dans cette organisation');
    }
    return user;
  }

  private publicMember(user: Partial<User>): Partial<User> {
    const {
      password,
      otp,
      otpExpiresAt,
      pushTokens,
      pinnedRoomIds,
      ...rest
    } = user;
    return rest;
  }

  private normalizeDomains(domains: string[]): string[] {
    const clean = domains
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
    for (const d of clean) {
      // Bloquer les messageries grand public : les autoriser reviendrait a
      // ouvrir l'organisation a n'importe qui possedant une telle adresse.
      if (PUBLIC_MAIL_DOMAINS.has(d)) {
        throw new BadRequestException(
          `${d} est une messagerie grand public et ne peut pas servir de domaine d'organisation.`,
        );
      }
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
        throw new BadRequestException(`Domaine invalide : ${d}`);
      }
    }
    return [...new Set(clean)];
  }

  private async findOrCreateBySlug(
    slug: string,
    name: string,
  ): Promise<Organization> {
    const existing = await this.orgsRepo.findOne({ where: { slug } });
    if (existing) return existing;
    return this.orgsRepo.save(this.orgsRepo.create({ name, slug }));
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'org';

    let candidate = base;
    for (let i = 2; ; i++) {
      const taken = await this.orgsRepo.findOne({
        where: { slug: candidate },
      });
      if (!taken) return candidate;
      candidate = `${base}-${i}`;
    }
  }
}

const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.fr',
  'hotmail.com',
  'hotmail.fr',
  'outlook.com',
  'outlook.fr',
  'live.com',
  'live.fr',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.fr',
  'orange.fr',
  'free.fr',
  'wanadoo.fr',
  'laposte.net',
  'sfr.fr',
  'yopmail.com',
  'mailinator.com',
]);
