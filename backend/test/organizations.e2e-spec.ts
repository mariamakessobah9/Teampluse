import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { bootstrapTestApp, readOtp, truncateAll, Session } from './helpers';

/**
 * Cloisonnement entre organisations et application des roles.
 *
 * Ces deux mecanismes sont les seules choses qui empechent les donnees d'une
 * entreprise d'apparaitre chez une autre, et un compte revoque de continuer a
 * lire les conversations. Ils ont ete valides a la main une fois ; ces tests
 * existent pour qu'une modification future ne les rouvre pas en silence.
 */
describe('Organisations : cloisonnement et roles', () => {
  let app: INestApplication;
  let db: DataSource;
  let http: () => ReturnType<typeof request>;

  const PASSWORD = 'secret123';

  beforeAll(async () => {
    ({ app, db } = await bootstrapTestApp());
    http = () => request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  /** Cree un compte, valide son OTP, et renvoie une session utilisable. */
  const signUp = async (
    email: string,
    body: Record<string, unknown>,
  ): Promise<Session> => {
    await http()
      .post('/api/auth/register')
      .send({ name: email.split('@')[0], email, password: PASSWORD, ...body })
      .expect(201);

    const res = await http()
      .post('/api/auth/verify-otp')
      .send({ email, otp: await readOtp(db, email) })
      .expect(201);

    return { token: res.body.token, userId: res.body.user.id, email };
  };

  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

  const invite = async (owner: Session, email: string, role = 'member') => {
    const res = await http()
      .post('/api/organizations/me/invitations')
      .set(auth(owner))
      .send({ email, role })
      .expect(201);
    return res.body.token as string;
  };

  // --- Rattachement a une organisation -------------------------------------

  describe("parcours d'inscription", () => {
    it('cree une organisation et en fait le responsable', async () => {
      const owner = await signUp('a@acme.test', { organizationName: 'Acme' });

      const me = await http()
        .get('/api/organizations/me')
        .set(auth(owner))
        .expect(200);

      expect(me.body.name).toBe('Acme');
      const members = await http()
        .get('/api/organizations/me/members')
        .set(auth(owner))
        .expect(200);
      expect(members.body).toHaveLength(1);
      expect(members.body[0].role).toBe('owner');
    });

    it('refuse un compte sans organisation ni invitation', async () => {
      const res = await http()
        .post('/api/auth/register')
        .send({ name: 'Seul', email: 'seul@nowhere.test', password: PASSWORD })
        .expect(400);
      expect(res.body.code).toBe('ORGANIZATION_REQUIRED');
    });

    it('rattache par domaine autorise, et refuse une messagerie grand public', async () => {
      const owner = await signUp('a@acme.test', { organizationName: 'Acme' });

      await http()
        .patch('/api/organizations/me')
        .set(auth(owner))
        .send({ allowedDomains: ['gmail.com'] })
        .expect(400);

      await http()
        .patch('/api/organizations/me')
        .set(auth(owner))
        .send({ allowedDomains: ['acme.test'] })
        .expect(200);

      const joiner = await signUp('b@acme.test', {});
      const members = await http()
        .get('/api/organizations/me/members')
        .set(auth(owner))
        .expect(200);
      expect(members.body.map((m: any) => m.email)).toContain(joiner.email);
      expect(
        members.body.find((m: any) => m.email === joiner.email).role,
      ).toBe('member');
    });
  });

  // --- Invitations ---------------------------------------------------------

  describe('invitations', () => {
    it('est nominative et ne sert qu\'une fois', async () => {
      const owner = await signUp('a@acme.test', { organizationName: 'Acme' });
      const token = await invite(owner, 'b@acme.test');

      // Detournee vers une autre adresse
      await http()
        .post('/api/auth/register')
        .send({
          name: 'Pirate',
          email: 'pirate@ailleurs.test',
          password: PASSWORD,
          invitationToken: token,
        })
        .expect(403);

      await signUp('b@acme.test', { invitationToken: token });

      // Rejouee apres usage
      await http()
        .post('/api/auth/register')
        .send({
          name: 'Encore',
          email: 'c@acme.test',
          password: PASSWORD,
          invitationToken: token,
        })
        .expect(400);
    });
  });

  // --- Cloisonnement -------------------------------------------------------

  describe('cloisonnement entre organisations', () => {
    let acme: Session;
    let other: Session;

    beforeEach(async () => {
      acme = await signUp('a@acme.test', { organizationName: 'Acme' });
      other = await signUp('x@other.test', { organizationName: 'Other' });
    });

    it("n'expose pas les membres d'une autre organisation dans la recherche", async () => {
      const res = await http()
        .get('/api/users/search')
        .query({ q: 'x@other' })
        .set(auth(acme))
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it("renvoie 404 sur le profil d'un membre d'une autre organisation", async () => {
      await http()
        .get(`/api/users/profile/${other.userId}`)
        .set(auth(acme))
        .expect(404);
    });

    it('interdit une conversation directe avec une autre organisation', async () => {
      await http()
        .post('/api/chat/rooms/direct')
        .set(auth(acme))
        .send({ targetUserId: other.userId })
        .expect(403);
    });

    it('interdit un groupe melangeant deux organisations', async () => {
      await http()
        .post('/api/chat/rooms/group')
        .set(auth(acme))
        .send({ name: 'Mixte', memberIds: [other.userId] })
        .expect(403);
    });

    it("ne laisse pas decouvrir ni rejoindre les canaux d'une autre organisation", async () => {
      const [general] = await db.query(
        `SELECT cr.id FROM chat_rooms cr
         JOIN organizations o ON o.id = cr."organizationId"
         WHERE o.name = 'Other' AND cr.name = 'general'`,
      );

      const discovered = await http()
        .get('/api/chat/channels')
        .set(auth(acme))
        .expect(200);
      expect(discovered.body).toEqual([]);

      await http()
        .post(`/api/chat/rooms/${general.id}/join`)
        .set(auth(acme))
        .expect(403);
    });

    it('limite la recherche de messages aux conversations dont on est membre', async () => {
      const [room] = await db.query(
        `SELECT cr.id FROM chat_rooms cr
         JOIN organizations o ON o.id = cr."organizationId"
         WHERE o.name = 'Other' AND cr.name = 'general'`,
      );
      await db.query(
        `INSERT INTO messages (content, type, "sender_id", "chat_room_id")
         VALUES ('budget confidentiel', 'text', $1, $2)`,
        [other.userId, room.id],
      );

      const mine = await http()
        .get('/api/chat/search')
        .query({ q: 'budget' })
        .set(auth(acme))
        .expect(200);
      expect(mine.body).toEqual([]);

      const theirs = await http()
        .get('/api/chat/search')
        .query({ q: 'budget' })
        .set(auth(other))
        .expect(200);
      expect(theirs.body).toHaveLength(1);
    });
  });

  // --- Roles ---------------------------------------------------------------

  describe('roles', () => {
    let owner: Session;
    let member: Session;

    beforeEach(async () => {
      owner = await signUp('a@acme.test', { organizationName: 'Acme' });
      member = await signUp('b@acme.test', {
        invitationToken: await invite(owner, 'b@acme.test'),
      });
    });

    it('refuse les routes d\'administration a un membre', async () => {
      await http()
        .get('/api/organizations/me/invitations')
        .set(auth(member))
        .expect(403);

      await http()
        .post(`/api/organizations/me/members/${owner.userId}/deactivate`)
        .set(auth(member))
        .expect(403);
    });

    it('applique une promotion sans reconnexion', async () => {
      await http()
        .patch(`/api/organizations/me/members/${member.userId}/role`)
        .set(auth(owner))
        .send({ role: 'admin' })
        .expect(200);

      // Meme jeton qu'avant la promotion : le role est relu en base.
      await http()
        .get('/api/organizations/me/invitations')
        .set(auth(member))
        .expect(200);
    });

    it('interdit de s\'attribuer le role de responsable', async () => {
      await http()
        .patch(`/api/organizations/me/members/${member.userId}/role`)
        .set(auth(owner))
        .send({ role: 'owner' })
        .expect(403);
    });

    it('empeche un administrateur de toucher au responsable', async () => {
      await http()
        .patch(`/api/organizations/me/members/${member.userId}/role`)
        .set(auth(owner))
        .send({ role: 'admin' })
        .expect(200);

      await http()
        .post(`/api/organizations/me/members/${owner.userId}/deactivate`)
        .set(auth(member))
        .expect(403);
    });
  });

  // --- Revocation ----------------------------------------------------------

  describe('desactivation', () => {
    it('invalide immediatement le jeton en cours et bloque la reconnexion', async () => {
      const owner = await signUp('a@acme.test', { organizationName: 'Acme' });
      const member = await signUp('b@acme.test', {
        invitationToken: await invite(owner, 'b@acme.test'),
      });

      await http().get('/api/users/me').set(auth(member)).expect(200);

      await http()
        .post(`/api/organizations/me/members/${member.userId}/deactivate`)
        .set(auth(owner))
        .expect(201);

      // Le jeton reste cryptographiquement valide : c'est la relecture en
      // base qui doit le refuser.
      await http().get('/api/users/me').set(auth(member)).expect(401);

      const login = await http()
        .post('/api/auth/login')
        .send({ email: member.email, password: PASSWORD })
        .expect(403);
      expect(login.body.code).toBe('ACCOUNT_DEACTIVATED');
    });

    it('retire le compte desactive de la recherche', async () => {
      const owner = await signUp('a@acme.test', { organizationName: 'Acme' });
      const member = await signUp('b@acme.test', {
        invitationToken: await invite(owner, 'b@acme.test'),
      });

      const before = await http()
        .get('/api/users/search')
        .query({ q: 'b@acme' })
        .set(auth(owner))
        .expect(200);
      expect(before.body).toHaveLength(1);

      await http()
        .post(`/api/organizations/me/members/${member.userId}/deactivate`)
        .set(auth(owner))
        .expect(201);

      const after = await http()
        .get('/api/users/search')
        .query({ q: 'b@acme' })
        .set(auth(owner))
        .expect(200);
      expect(after.body).toEqual([]);
    });
  });

  // --- Suppression de compte -----------------------------------------------

  describe('suppression de compte', () => {
    it('efface les donnees personnelles et rend le compte inutilisable', async () => {
      const owner = await signUp('a@acme.test', { organizationName: 'Acme' });
      const member = await signUp('b@acme.test', {
        invitationToken: await invite(owner, 'b@acme.test'),
      });

      await http()
        .delete('/api/users/me')
        .set(auth(member))
        .send({ password: 'mauvais' })
        .expect(401);

      await http()
        .delete('/api/users/me')
        .set(auth(member))
        .send({ password: PASSWORD })
        .expect(200);

      const [row] = await db.query(
        'SELECT name, email, phone, avatar, "isActive", "deletedAt" FROM users WHERE id = $1',
        [member.userId],
      );
      expect(row.name).toBe('Compte supprime');
      expect(row.email).not.toContain('acme.test');
      expect(row.phone).toBeNull();
      expect(row.avatar).toBeNull();
      expect(row.isActive).toBe(false);
      expect(row.deletedAt).not.toBeNull();

      await http()
        .post('/api/auth/login')
        .send({ email: 'b@acme.test', password: PASSWORD })
        .expect(401);

      const members = await http()
        .get('/api/organizations/me/members')
        .set(auth(owner))
        .expect(200);
      expect(members.body).toHaveLength(1);
    });

    it('impose au responsable de transferer son role au prealable', async () => {
      const owner = await signUp('a@acme.test', { organizationName: 'Acme' });
      const member = await signUp('b@acme.test', {
        invitationToken: await invite(owner, 'b@acme.test'),
      });

      const refused = await http()
        .delete('/api/users/me')
        .set(auth(owner))
        .send({ password: PASSWORD })
        .expect(403);
      expect(refused.body.code).toBe('OWNER_MUST_TRANSFER');

      await http()
        .post('/api/organizations/me/transfer-ownership')
        .set(auth(owner))
        .send({ userId: member.userId })
        .expect(201);

      await http()
        .delete('/api/users/me')
        .set(auth(owner))
        .send({ password: PASSWORD })
        .expect(200);
    });
  });

  // --- Accueil -------------------------------------------------------------

  describe('canal d\'accueil', () => {
    it('inscrit chaque nouvel arrivant au canal general', async () => {
      const owner = await signUp('a@acme.test', { organizationName: 'Acme' });
      const member = await signUp('b@acme.test', {
        invitationToken: await invite(owner, 'b@acme.test'),
      });

      const rooms = await http()
        .get('/api/chat/rooms')
        .set(auth(member))
        .expect(200);

      expect(rooms.body.map((r: any) => r.name)).toContain('general');
    });
  });
});
