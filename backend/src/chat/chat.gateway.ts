import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CallsService } from '../calls/calls.service';
import { ChatRoom } from './entities/chat-room.entity';
import { Message } from './entities/message.entity';
import { randomUUID } from 'crypto';
import {
  ActiveCall,
  CallStateService,
  joinedIds,
  newParticipant,
  participantIds,
} from '../calls/call-state.service';
import { LiveKitService } from '../calls/livekit.service';

const userRoomKey = (userId: string) => `user:${userId}`;

/** Duree de sonnerie avant classement en appel manque. */
const RING_TIMEOUT_MS = 45_000;

/**
 * Au-dela, la grille video devient illisible sur un telephone et le debit
 * descendant sature les connexions mobiles.
 */
const MAX_CALL_PARTICIPANTS = 12;

type CallAck =
  | {
      ok: true;
      callId: string;
      callType: string;
      mode: 'direct' | 'group';
      participants: unknown[];
    }
  | { ok: false; error: string };

const messagePreview = (message: Message): string => {
  switch (message.type) {
    case 'image':
      return '📷 Photo';
    case 'file':
      return `📎 ${message.fileName || 'Document'}`;
    case 'voice':
      return '🎤 Voice message';
    default:
      return message.content || '';
  }
};

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
    private readonly callsService: CallsService,
    private readonly callState: CallStateService,
    private readonly livekit: LiveKitService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      // Porte par le socket : `fetchSockets()` renvoie aussi les sockets des
      // autres instances, avec leur `data`. Une Map locale, elle, ne
      // connaitrait que les sockets de l'instance courante.
      client.data.userId = userId;
      client.join(userRoomKey(userId));
      await this.usersService.setOnlineStatus(userId, true);

      // Notify others that user is online
      this.server.emit('user-online', { userId });

      console.log(`User ${userId} connected (socket: ${client.id})`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;

    await this.usersService.setOnlineStatus(userId, false);
    this.server.emit('user-offline', { userId });

    // L'utilisateur peut avoir d'autres sockets ouverts (deuxieme appareil),
    // y compris sur une autre instance : fetchSockets() les voit tous via
    // l'adapter Redis. Le socket courant a deja quitte ses rooms a ce stade,
    // on le filtre par prudence.
    const remaining = (
      await this.server.in(userRoomKey(userId)).fetchSockets()
    ).filter((s) => s.id !== client.id);
    if (remaining.length > 0) return;

    for (const call of await this.callState.findByUser(userId)) {
      // Chez un invite, le socket coupe veut surtout dire « application en
      // arriere-plan » : la notification poussee peut encore le reveiller,
      // et la synchro a la reconnexion refera sonner. Seul un participant
      // deja dans l'appel le quitte en perdant la connexion.
      if (call.participants[userId]?.state !== 'joined') continue;
      await this.leaveCall(call.callId, userId);
    }
    console.log(`User ${userId} disconnected`);
  }

  // ---------------------------------------------------------------------
  // Appels
  //
  // Le media ne passe plus par ce gateway : LiveKit s'occupe de la
  // negociation et du transport. Ce qui reste ici est ce qu'un SFU ne sait
  // pas faire — sonner chez quelqu'un, savoir qui a refuse, classer un appel
  // manque — plus l'etat partage qui autorise la remise d'un jeton d'acces.
  // ---------------------------------------------------------------------

  /** Diffuse un evenement a tous les participants connus d'un appel. */
  private broadcast(
    call: ActiveCall,
    event: string,
    payload: unknown,
    exceptUserId?: string,
  ): void {
    for (const id of participantIds(call)) {
      if (id === exceptUserId) continue;
      this.server.to(userRoomKey(id)).emit(event, payload);
    }
  }

  /** Profil public d'un participant, tel qu'affiche dans l'ecran d'appel. */
  private async publicUser(userId: string) {
    const user = await this.usersService.findByIdOrNull(userId);
    return user
      ? { id: user.id, name: user.name, avatar: user.avatar }
      : null;
  }

  private async participantsPayload(call: ActiveCall) {
    const users = await Promise.all(
      participantIds(call).map(async (id) => {
        const user = await this.publicUser(id);
        return user ? { ...user, state: call.participants[id].state } : null;
      }),
    );
    return users.filter((u): u is NonNullable<typeof u> => u !== null);
  }

  /** Ce que recoit un telephone qui sonne, et ce que renvoie une synchro. */
  private async incomingPayload(call: ActiveCall) {
    const [caller, participants, room] = await Promise.all([
      this.publicUser(call.callerId),
      this.participantsPayload(call),
      call.roomId
        ? this.chatService.getRoomById(call.roomId).catch(() => null)
        : Promise.resolve(null),
    ]);
    return {
      callId: call.callId,
      callType: call.type,
      mode: call.mode,
      caller,
      room: room ? { id: room.id, name: room.name ?? null } : null,
      participants,
    };
  }

  private async isRoomMember(roomId: string, userId: string) {
    const room = await this.chatService.getRoomById(roomId).catch(() => null);
    return !!room?.members?.some((m) => m.id === userId);
  }

  /** Previent les membres d'un salon qu'un appel y commence ou s'y termine. */
  private async emitRoomCall(
    roomId: string,
    event: 'room-call-started' | 'room-call-ended',
    payload: Record<string, unknown>,
  ): Promise<void> {
    const room = await this.chatService.getRoomById(roomId).catch(() => null);
    for (const member of room?.members ?? []) {
      this.server
        .to(userRoomKey(member.id))
        .emit(event, { roomId, ...payload });
    }
  }

  /**
   * Etat d'un participant tel qu'il doit etre archive.
   *
   * `duration` compte le temps reellement passe dans la salle, y compris
   * plusieurs passages : on peut quitter un appel de groupe et le rejoindre.
   * Un appel qui n'a jamais demarre n'a de duree pour personne : l'appelant
   * seul dans la salle attendait, il ne telephonait pas.
   */
  private participantRecords(call: ActiveCall) {
    const now = Date.now();
    return participantIds(call).map((id) => {
      const p = call.participants[id];
      const everJoined = p.state === 'joined' || p.state === 'left';
      const live = p.joinedAt ? Math.round((now - p.joinedAt) / 1000) : 0;
      return {
        userId: id,
        status:
          p.state === 'declined'
            ? 'declined'
            : everJoined
              ? 'joined'
              : 'missed',
        isInitiator: id === call.callerId,
        duration: call.startedAt ? p.duration + live : 0,
      };
    });
  }

  private async recordCall(call: ActiveCall): Promise<void> {
    const others = participantIds(call).filter((id) => id !== call.callerId);
    const status = call.startedAt
      ? 'completed'
      : others.length > 0 &&
          others.every((id) => call.participants[id].state === 'declined')
        ? 'rejected'
        : 'missed';

    await this.callsService
      .record({
        callerId: call.callerId,
        // Renseigne pour un appel a deux seulement : c'est ce qui permet a
        // l'historique de rester lisible sans jointure sur les participants.
        calleeId: call.mode === 'direct' ? (others[0] ?? null) : null,
        mode: call.mode,
        chatRoomId: call.roomId,
        type: call.type,
        status,
        duration: call.startedAt
          ? Math.round((Date.now() - call.startedAt) / 1000)
          : 0,
        participants: this.participantRecords(call),
      })
      .catch(() => undefined);
  }

  /**
   * Cloture definitive : archivage, liberation de la salle SFU, et un mot a
   * chacun pour que personne ne reste sur un ecran d'appel fantome.
   *
   * `reason` est affiche a ceux qui etaient dans l'appel (refuse, pas de
   * reponse) ; ceux chez qui ca sonnait encore voient simplement la
   * sonnerie s'arreter.
   */
  private async finishCall(
    callId: string,
    reason?: 'rejected' | 'busy' | 'timeout',
  ): Promise<void> {
    // Deux departs simultanes arrivent ici tous les deux : seul le premier
    // pose `endedAt`, le second abandonne sans archiver une seconde fois.
    const call = await this.callState.mutate(callId, (c) => {
      if (c.endedAt) return null;
      c.endedAt = Date.now();
      return c;
    });
    if (!call) return;

    this.clearRingTimer(callId);

    for (const id of participantIds(call)) {
      if (call.participants[id].state === 'invited') {
        this.server.to(userRoomKey(id)).emit('call-cancelled', { callId });
      } else {
        this.server
          .to(userRoomKey(id))
          .emit('call-ended', { callId, reason: reason ?? null });
      }
    }

    if (call.roomId) {
      await this.callState.releaseRoomCall(call.roomId, callId);
      await this.emitRoomCall(call.roomId, 'room-call-ended', { callId });
    }

    await this.recordCall(call);
    await this.callState.delete(callId);
    // Un client qui a perdu le socket mais garde sa connexion LiveKit
    // continuerait sinon a publier son micro dans une salle censee fermee.
    await this.livekit.closeRoom(callId);
    // Ceux chez qui ca sonnait encore : l'appelant a raccroche avant eux.
    await this.notifyMissed(
      call,
      participantIds(call).filter(
        (id) => call.participants[id].state === 'invited',
      ),
    );
  }

  /**
   * Previent ceux qui n'ont pas decroche.
   *
   * Un refus est un choix : le signaler comme un appel manque serait faux,
   * d'ou une liste explicite plutot qu'un filtre sur l'etat.
   */
  private async notifyMissed(
    call: ActiveCall,
    targets: string[],
  ): Promise<void> {
    if (targets.length === 0) return;

    const caller = await this.publicUser(call.callerId);
    if (!caller) return;
    const label = call.type === 'video' ? 'Appel vidéo manqué' : 'Appel manqué';

    await this.notificationsService
      .sendToUsers(targets, {
        title: caller.name,
        body: call.mode === 'group' ? `${label} (groupe)` : label,
        data: { type: 'missed-call', callId: call.callId },
      })
      .catch(() => undefined);
  }

  /**
   * Regle de fin commune : l'appel s'arrete quand plus personne n'est
   * dedans, ou quand il ne reste qu'une personne et qu'aucun telephone ne
   * sonne plus. Dans un groupe, un depart ne coupe donc pas les autres.
   */
  private shouldFinish(call: ActiveCall): boolean {
    const joined = joinedIds(call);
    const ringing = participantIds(call).filter(
      (id) => call.participants[id].state === 'invited',
    );
    return joined.length === 0 || (joined.length < 2 && ringing.length === 0);
  }

  /**
   * Un participant quitte l'appel — raccrochage, perte du reseau, fermeture
   * de l'application.
   */
  private async leaveCall(callId: string, userId: string): Promise<void> {
    const call = await this.callState.mutate(callId, (c) => {
      const p = c.participants?.[userId];
      if (!p || c.endedAt) return null;
      if (p.state !== 'joined' && p.state !== 'invited') return null;
      if (p.joinedAt) {
        p.duration += Math.round((Date.now() - p.joinedAt) / 1000);
        p.joinedAt = null;
      }
      // Quitter avant d'avoir decroche, c'est refuser.
      p.state = p.state === 'invited' ? 'declined' : 'left';
      return c;
    });
    if (!call) return;

    this.broadcast(call, 'call-participant-left', { callId, userId }, userId);

    if (this.shouldFinish(call)) {
      await this.finishCall(callId);
    } else {
      this.broadcast(call, 'call-participants-updated', {
        callId,
        participants: await this.participantsPayload(call),
      });
    }
  }

  /**
   * Entree dans la salle : decrocher un appel qui sonne, ou rejoindre un
   * appel de groupe deja en cours dans un salon dont on est membre.
   */
  private async joinCall(
    client: Socket,
    callId: string,
    userId: string,
  ): Promise<ActiveCall | null> {
    const current = await this.callState.get(callId);
    if (!current || current.endedAt) return null;

    const known = !!current.participants?.[userId];
    const allowed =
      known ||
      (!!current.roomId && (await this.isRoomMember(current.roomId, userId)));
    if (!allowed) return null;

    const call = await this.callState.mutate(callId, (c) => {
      if (c.endedAt) return null;
      const p = c.participants[userId] ?? newParticipant(userId, 'invited');
      if (p.state !== 'joined') {
        p.state = 'joined';
        p.joinedAt = Date.now();
      }
      c.participants[userId] = p;
      if (!c.startedAt && joinedIds(c).length >= 2) c.startedAt = Date.now();
      return c;
    });
    if (!call) return null;

    const stillRinging = participantIds(call).some(
      (id) => call.participants[id].state === 'invited',
    );
    if (!stillRinging) this.clearRingTimer(callId);

    // Les autres appareils du meme compte cessent de sonner.
    client.to(userRoomKey(userId)).emit('call-answered-elsewhere', { callId });

    this.broadcast(
      call,
      'call-participant-joined',
      {
        callId,
        user: await this.publicUser(userId),
        participants: await this.participantsPayload(call),
      },
      userId,
    );
    return call;
  }

  /**
   * Minuteurs de sonnerie, par appel.
   *
   * Sans eux, un appel que personne ne decroche reste ouvert indefiniment :
   * l'appelant entend la sonnerie sans fin et les destinataires ne voient
   * jamais d'appel manque dans leur historique.
   */
  private readonly ringTimers = new Map<string, NodeJS.Timeout>();

  private clearRingTimer(callId: string): void {
    const timer = this.ringTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.ringTimers.delete(callId);
    }
  }

  private armRingTimer(callId: string): void {
    this.clearRingTimer(callId);
    this.ringTimers.set(
      callId,
      setTimeout(() => {
        this.ringTimers.delete(callId);
        void this.expireRing(callId);
      }, RING_TIMEOUT_MS),
    );
  }

  /**
   * Fin de la fenetre de sonnerie.
   *
   * Ceux qui n'ont pas repondu cessent d'etre attendus. Si l'appel a trouve
   * son monde entre-temps, il continue sans eux — c'est la difference avec
   * un appel a deux, ou l'absence de reponse met fin a tout.
   */
  private async expireRing(callId: string): Promise<void> {
    let missed: string[] = [];
    const call = await this.callState.mutate(callId, (c) => {
      // Le mutateur peut etre rejoue sur conflit : on repart de zero.
      missed = [];
      if (c.endedAt) return null;
      for (const id of participantIds(c)) {
        if (c.participants[id].state === 'invited') {
          c.participants[id].state = 'missed';
          missed.push(id);
        }
      }
      return missed.length ? c : null;
    });
    if (!call) return;

    for (const id of missed) {
      this.server.to(userRoomKey(id)).emit('call-cancelled', { callId });
    }
    await this.notifyMissed(call, missed);

    if (this.shouldFinish(call)) {
      await this.finishCall(callId, 'timeout');
    } else {
      this.broadcast(call, 'call-participants-updated', {
        callId,
        participants: await this.participantsPayload(call),
      });
    }
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    client.join(data.roomId);
    const userId = client.data.userId as string | undefined;

    // Mark messages as read when joining
    if (userId) {
      await this.chatService.markMessagesAsRead(data.roomId, userId);
    }

    console.log(`Socket ${client.id} joined room ${data.roomId}`);
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    client.leave(data.roomId);
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      content: string;
      type?: string;
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      duration?: number;
    },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;

    const message = await this.chatService.sendMessage(
      data.roomId,
      userId,
      data.content,
      data.type,
      data.fileUrl,
      {
        fileName: data.fileName,
        fileSize: data.fileSize,
        duration: data.duration,
      },
    );

    // Broadcast to all clients in the room
    this.server.to(data.roomId).emit('new-message', message);

    // Update message status to delivered for online users in the room
    const roomSockets = await this.server.in(data.roomId).fetchSockets();
    if (roomSockets.length > 1) {
      this.server.to(data.roomId).emit('message-delivered', {
        messageId: message.id,
        roomId: data.roomId,
      });
    }

    // Push notification to members who aren't currently viewing the room
    const room = await this.chatService.getRoomById(data.roomId);
    const activeUserIds = new Set(
      roomSockets
        .map((s) => s.data?.userId as string | undefined)
        .filter((id): id is string => Boolean(id)),
    );
    const recipients = room.members
      .map((m) => m.id)
      .filter((id) => id !== userId && !activeUserIds.has(id));

    if (recipients.length > 0) {
      const senderName = message.sender?.name || 'New message';
      const isGroup = room.type === 'group';
      this.notificationsService
        .sendToUsers(recipients, {
          title: isGroup ? room.name || 'Group' : senderName,
          body: isGroup
            ? `${senderName}: ${messagePreview(message)}`
            : messagePreview(message),
          data: { type: 'message', roomId: data.roomId },
        })
        .catch(() => undefined);
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isTyping: boolean },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;

    client.to(data.roomId).emit('user-typing', {
      userId,
      roomId: data.roomId,
      isTyping: data.isTyping,
    });
  }

  @SubscribeMessage('mark-read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;

    await this.chatService.markMessagesAsRead(data.roomId, userId);
    this.server.to(data.roomId).emit('messages-read', {
      roomId: data.roomId,
      userId,
    });
  }

  // ---- Appels : evenements client ----
  //
  // Les handlers renvoient un accuse de reception (`emitWithAck` cote
  // client) : l'application sait tout de suite si l'appel est parti, et
  // pourquoi il ne l'est pas, au lieu d'attendre une sonnerie qui ne
  // viendra jamais.

  @SubscribeMessage('call-initiate')
  async handleCallInitiate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      callType?: string;
      calleeIds?: string[];
      /** Ancien client : un seul destinataire. */
      calleeId?: string;
      /** Appel lance depuis un salon : tous ses membres sont appeles. */
      roomId?: string;
    },
  ): Promise<CallAck> {
    const userId = client.data.userId as string | undefined;
    if (!userId) return { ok: false, error: 'Non authentifié.' };
    if (!this.livekit.isConfigured()) {
      return {
        ok: false,
        error: 'Les appels ne sont pas disponibles pour le moment.',
      };
    }

    const caller = await this.usersService.findByIdOrNull(userId);
    if (!caller?.organizationId) {
      return { ok: false, error: "Cette personne n'est pas joignable." };
    }
    const callType = data?.callType === 'video' ? 'video' : 'audio';

    let calleeIds: string[];
    let roomId: string | null = null;

    if (data?.roomId) {
      const room = await this.chatService
        .getRoomById(data.roomId)
        .catch(() => null);
      if (!room || !room.members.some((m) => m.id === userId)) {
        return { ok: false, error: 'Conversation introuvable.' };
      }
      calleeIds = room.members.map((m) => m.id);
      // Seul un salon de groupe porte un appel « de salon » que les membres
      // peuvent rejoindre en cours ; une conversation a deux reste un appel
      // direct.
      if (room.type === 'group') roomId = room.id;
    } else {
      calleeIds = data?.calleeIds?.length
        ? data.calleeIds
        : data?.calleeId
          ? [data.calleeId]
          : [];
    }

    calleeIds = [...new Set(calleeIds)].filter(
      (id) => typeof id === 'string' && id.length > 0 && id !== userId,
    );
    if (calleeIds.length === 0) {
      return { ok: false, error: 'Personne à appeler.' };
    }
    if (calleeIds.length + 1 > MAX_CALL_PARTICIPANTS) {
      return {
        ok: false,
        error: `Un appel est limité à ${MAX_CALL_PARTICIPANTS} participants.`,
      };
    }

    // Les destinataires doivent partager l'organisation de l'appelant : un
    // identifiant est vite devine, le socket ne doit pas servir a sonner
    // chez n'importe qui.
    if (
      !(await this.usersService.allInOrganization(
        calleeIds,
        caller.organizationId,
      ))
    ) {
      return { ok: false, error: "Cette personne n'est pas joignable." };
    }

    // Un appel est deja en cours dans ce salon : on le rejoint plutot que
    // d'en ouvrir un second a cote.
    if (roomId) {
      const existing = await this.callState.getRoomCall(roomId);
      if (existing) {
        return this.handleCallJoin(client, { callId: existing.callId });
      }
    }

    const callId = randomUUID();
    const participants: ActiveCall['participants'] = {
      [userId]: newParticipant(userId, 'joined'),
    };
    for (const id of calleeIds) {
      participants[id] = newParticipant(id, 'invited');
    }

    const call: ActiveCall = {
      callId,
      callerId: userId,
      mode: calleeIds.length > 1 || roomId ? 'group' : 'direct',
      roomId,
      type: callType,
      startedAt: null,
      participants,
    };

    if (roomId) {
      const taken = await this.callState.claimRoomCall(roomId, callId);
      // Un autre membre a lance l'appel dans la meme seconde.
      if (taken) return this.handleCallJoin(client, { callId: taken });
    }

    await this.callState.set(call);

    const payload = await this.incomingPayload(call);
    for (const id of calleeIds) {
      this.server.to(userRoomKey(id)).emit('incoming-call', payload);
    }

    // Notification poussee meme quand un socket est ouvert : sur Android le
    // socket survit quelques minutes en arriere-plan mais l'ecran reste
    // eteint. L'application masque la banniere si elle sonne deja. Non
    // attendue : l'appelant n'a pas a patienter derriere le service de push
    // pour entendre la sonnerie.
    const label =
      callType === 'video' ? 'Appel vidéo entrant' : 'Appel entrant';
    void this.notificationsService
      .sendToUsers(calleeIds, {
        title:
          call.mode === 'group'
            ? payload.room?.name || `${caller.name} et d'autres`
            : caller.name,
        body: call.mode === 'group' ? `${label} de ${caller.name}` : label,
        data: { type: 'incoming-call', callId, callType },
      })
      .catch(() => undefined);

    this.armRingTimer(callId);

    if (roomId) {
      await this.emitRoomCall(roomId, 'room-call-started', {
        callId,
        callType,
      });
    }

    return {
      ok: true,
      callId,
      callType,
      mode: call.mode,
      participants: payload.participants,
    };
  }

  /**
   * Appel en attente pour ce client, s'il en reste un.
   *
   * L'application interroge le serveur a chaque reconnexion : un appel lance
   * pendant qu'elle dormait en arriere-plan aurait sinon sonne dans le vide,
   * l'evenement `incoming-call` etant emis vers un socket deja ferme.
   */
  @SubscribeMessage('call-sync')
  async handleCallSync(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;

    for (const call of await this.callState.findByUser(userId)) {
      if (call.endedAt) continue;
      if (call.participants[userId]?.state !== 'invited') continue;
      client.emit('incoming-call', await this.incomingPayload(call));
      return;
    }
  }

  /** Decrocher. Meme traitement que rejoindre, garde pour la lisibilite. */
  @SubscribeMessage('call-accept')
  async handleCallAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ): Promise<CallAck> {
    return this.handleCallJoin(client, data);
  }

  /** Rejoindre un appel en cours (decroche ou appel de salon). */
  @SubscribeMessage('call-join')
  async handleCallJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ): Promise<CallAck> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data?.callId) {
      return { ok: false, error: 'Appel invalide.' };
    }

    const call = await this.joinCall(client, data.callId, userId);
    if (!call) return { ok: false, error: "Cet appel n'est plus en cours." };

    return {
      ok: true,
      callId: call.callId,
      callType: call.type,
      mode: call.mode,
      participants: await this.participantsPayload(call),
    };
  }

  @SubscribeMessage('call-reject')
  async handleCallReject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; busy?: boolean },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data?.callId) return;

    const call = await this.callState.mutate(data.callId, (c) => {
      const p = c.participants?.[userId];
      if (!p || p.state !== 'invited' || c.endedAt) return null;
      p.state = 'declined';
      return c;
    });
    if (!call) return;

    // Les autres appareils du meme compte cessent de sonner.
    client
      .to(userRoomKey(userId))
      .emit('call-cancelled', { callId: data.callId });

    if (this.shouldFinish(call)) {
      await this.finishCall(data.callId, data.busy ? 'busy' : 'rejected');
      return;
    }
    this.broadcast(call, 'call-participants-updated', {
      callId: data.callId,
      participants: await this.participantsPayload(call),
    });
  }

  /** L'appelant raccroche avant qu'on decroche. */
  @SubscribeMessage('call-cancel')
  async handleCallCancel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data?.callId) return;
    await this.leaveCall(data.callId, userId);
  }

  @SubscribeMessage('call-end')
  async handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data?.callId) return;
    await this.leaveCall(data.callId, userId);
  }

  /**
   * Appel en cours dans un salon, pour afficher « Rejoindre » a l'ouverture
   * de la conversation. Reserve aux membres : la simple existence d'un appel
   * dans un salon prive n'a pas a fuiter.
   */
  @SubscribeMessage('call-room-status')
  async handleRoomCallStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data?.roomId) return { call: null };
    if (!(await this.isRoomMember(data.roomId, userId))) return { call: null };

    const call = await this.callState.getRoomCall(data.roomId);
    if (!call || call.endedAt) return { call: null };
    return {
      call: {
        callId: call.callId,
        callType: call.type,
        participants: await this.participantsPayload(call),
      },
    };
  }

  // ---- Helpers used by REST controllers to broadcast group changes ----

  emitRoomCreated(room: ChatRoom): void {
    for (const member of room.members ?? []) {
      this.server.to(userRoomKey(member.id)).emit('room-created', room);
    }
  }

  emitRoomUpdated(room: ChatRoom): void {
    this.server.to(room.id).emit('room-updated', room);
    for (const member of room.members ?? []) {
      this.server.to(userRoomKey(member.id)).emit('room-updated', room);
    }
  }

  emitRoomDeleted(roomId: string): void {
    this.server.to(roomId).emit('room-deleted', { roomId });
  }

  emitMemberRemoved(roomId: string, userId: string, room: ChatRoom): void {
    this.server
      .to(userRoomKey(userId))
      .emit('removed-from-room', { roomId });
    this.server.to(roomId).emit('room-updated', room);
    for (const member of room.members ?? []) {
      this.server.to(userRoomKey(member.id)).emit('room-updated', room);
    }
  }

  emitMessageDeleted(roomId: string, messageId: string): void {
    this.server.to(roomId).emit('message-deleted', { roomId, messageId });
  }
}
