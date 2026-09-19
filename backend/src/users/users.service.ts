import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, IsNull, Not, Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Variante sans exception, pour les chemins ou l'absence est attendue. */
  async findByIdOrNull(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  /**
   * Profil consultable uniquement par un collegue de la meme organisation :
   * sans ce controle, n'importe quel identifiant devine exposerait l'adresse
   * e-mail et le telephone d'un membre d'une autre entreprise.
   */
  async findInOrganization(id: string, organizationId: string | null): Promise<User> {
    const user = await this.findById(id);
    if (!organizationId || user.organizationId !== organizationId) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /** Vrai si tous les identifiants appartiennent a cette organisation. */
  async allInOrganization(
    ids: string[],
    organizationId: string | null,
  ): Promise<boolean> {
    if (!organizationId) return false;
    const unique = [...new Set(ids)];
    if (unique.length === 0) return true;
    const count = await this.usersRepo.count({
      where: { id: In(unique), organizationId, isActive: true },
    });
    return count === unique.length;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.usersRepo.create(data);
    return this.usersRepo.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.usersRepo.update(id, data);
    return this.findById(id);
  }

  async setOnlineStatus(id: string, isOnline: boolean): Promise<void> {
    await this.usersRepo.update(id, { isOnline });
  }

  async addPushToken(id: string, token: string): Promise<void> {
    if (!token) return;
    const user = await this.findById(id);
    const tokens = new Set(user.pushTokens || []);
    tokens.add(token);
    await this.usersRepo.update(id, { pushTokens: [...tokens] });
  }

  async removePushToken(id: string, token: string): Promise<void> {
    const user = await this.findById(id);
    const tokens = (user.pushTokens || []).filter((t) => t !== token);
    await this.usersRepo.update(id, { pushTokens: tokens });
  }

  async getPushTokens(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const users = await this.usersRepo.find({
      where: { id: In(userIds) },
      select: ['id', 'pushTokens'],
    });
    return users.flatMap((u) => u.pushTokens || []);
  }

  async getPinnedRoomIds(userId: string): Promise<string[]> {
    const user = await this.findById(userId);
    return user.pinnedRoomIds || [];
  }

  async pinRoom(userId: string, roomId: string): Promise<void> {
    const user = await this.findById(userId);
    const pinned = new Set(user.pinnedRoomIds || []);
    pinned.add(roomId);
    await this.usersRepo.update(userId, { pinnedRoomIds: [...pinned] });
  }

  async unpinRoom(userId: string, roomId: string): Promise<void> {
    const user = await this.findById(userId);
    const pinned = (user.pinnedRoomIds || []).filter((id) => id !== roomId);
    await this.usersRepo.update(userId, { pinnedRoomIds: pinned });
  }

  async pruneTokens(deadTokens: string[]): Promise<void> {
    if (deadTokens.length === 0) return;
    const dead = new Set(deadTokens);
    const users = await this.usersRepo
      .createQueryBuilder('user')
      .select(['user.id', 'user.pushTokens'])
      .where('user.pushTokens IS NOT NULL')
      .getMany();
    for (const user of users) {
      const current = user.pushTokens || [];
      const remaining = current.filter((t) => !dead.has(t));
      if (remaining.length !== current.length) {
        await this.usersRepo.update(user.id, { pushTokens: remaining });
      }
    }
  }

  async remove(id: string): Promise<void> {
    await this.usersRepo.delete(id);
  }

  /**
   * Suppression du compte a la demande de son titulaire, exigee par Google
   * Play des lors qu'une application permet d'en creer un.
   *
   * La ligne n'est pas supprimee : `messages.sender_id` la reference, et
   * effacer les messages creverait des trous dans les conversations des
   * collegues, qui ne sont pas les donnees de cette personne. Toutes les
   * donnees personnelles sont en revanche ecrasees, le compte devient
   * inutilisable et disparait de l'annuaire. Ce qui subsiste, ce sont les
   * messages deja envoyes a des tiers, desormais dissocies de leur auteur.
   */
  async deleteAccount(id: string, password: string): Promise<void> {
    const user = await this.findById(id);
    if (user.deletedAt) return;

    // Re-authentification : un telephone deverrouille ne doit pas suffire a
    // effacer un compte.
    const valid = await bcrypt.compare(password ?? '', user.password);
    if (!valid) throw new UnauthorizedException('Mot de passe incorrect');

    if (user.role === 'owner' && user.organizationId) {
      const remaining = await this.usersRepo.count({
        where: {
          organizationId: user.organizationId,
          deletedAt: IsNull(),
          id: Not(id),
        },
      });
      if (remaining > 0) {
        throw new ForbiddenException({
          message:
            "Transferez d'abord la responsabilite de l'organisation a un autre membre.",
          code: 'OWNER_MUST_TRANSFER',
        });
      }
    }

    await this.usersRepo.update(id, {
      name: 'Compte supprime',
      // L'adresse reste unique en base sans etre routable, et ne permet plus
      // de retrouver la personne. `.invalid` est reserve a cet usage (RFC 2606).
      email: `deleted-${id}@deleted.invalid`,
      // Aucun mot de passe connu ne correspond : plus aucune connexion possible.
      password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
      avatar: null,
      phone: null,
      otp: null,
      otpExpiresAt: null,
      pushTokens: [],
      pinnedRoomIds: [],
      isActive: false,
      isOnline: false,
      isVerified: false,
      deletedAt: new Date(),
      deactivatedAt: new Date(),
    });
  }

  /**
   * Annuaire restreint a l'organisation de la personne qui cherche. Sans le
   * filtre `organizationId`, la recherche exposait tous les comptes de la
   * base, toutes entreprises confondues.
   */
  async search(
    query: string,
    excludeId: string,
    organizationId: string | null,
  ): Promise<Partial<User>[]> {
    const q = query?.trim();
    if (!q || q.length < 2) return [];
    if (!organizationId) return [];
    const pattern = `%${q}%`;
    // Les comptes desactives sont exclus : on ne demarre pas une conversation
    // avec quelqu'un qui n'a plus acces a l'application.
    const common = {
      id: Not(excludeId),
      organizationId,
      isVerified: true,
      isActive: true,
      deletedAt: IsNull(),
    };
    const users = await this.usersRepo.find({
      where: [
        { ...common, name: ILike(pattern) },
        { ...common, email: ILike(pattern) },
      ],
      select: ['id', 'name', 'email', 'avatar', 'isOnline', 'role'],
      take: 20,
      order: { name: 'ASC' },
    });
    return users;
  }
}
