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
import { ActiveCall, CallStateService } from './call-state.service';

const userRoomKey = (userId: string) => `user:${userId}`;

/** Duree de sonnerie avant classement en appel manque. */
const RING_TIMEOUT_MS = 45_000;

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
      const otherId =
        call.callerId === userId ? call.calleeId : call.callerId;
      this.clearRingTimer(call.callId);
      this.server
        .to(userRoomKey(otherId))
        .emit('call-ended', { callId: call.callId });
      await this.recordCall(call, call.startedAt ? 'completed' : 'missed');
      await this.callState.delete(call.callId);
      // L'appelant a perdu le reseau avant qu'on decroche : le destinataire
      // doit quand meme retrouver l'appel manque.
      if (!call.startedAt && call.callerId === userId) {
        await this.notifyMissedCall(call);
      }
    }
    console.log(`User ${userId} disconnected`);
  }

  private async recordCall(call: ActiveCall, status: string): Promise<void> {
    const duration = call.startedAt
      ? Math.round((Date.now() - call.startedAt) / 1000)
      : 0;
    await this.callsService
      .record({
        callerId: call.callerId,
        calleeId: call.calleeId,
        type: call.type,
        status,
        duration,
      })
      .catch(() => undefined);
  }

  /**
   * Minuteurs de sonnerie, par appel.
   *
   * Sans eux, un appel que personne ne decroche reste ouvert indefiniment :
   * l'appelant entend la sonnerie sans fin et le destinataire ne voit jamais
   * d'appel manque dans son historique.
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
        void this.expireCall(callId);
      }, RING_TIMEOUT_MS),
    );
  }

  /** Sonnerie ecoulee sans reponse : appel manque des deux cotes. */
  private async expireCall(callId: string): Promise<void> {
    const call = await this.callState.get(callId);
    // `startedAt` renseigne = deja decroche, le minuteur n'a plus lieu d'etre.
    if (!call || call.startedAt) return;

    for (const userId of [call.callerId, call.calleeId]) {
      this.server
        .to(userRoomKey(userId))
        .emit('call-timeout', { callId });
    }
    await this.recordCall(call, 'missed');
    await this.callState.delete(callId);
    await this.notifyMissedCall(call);
  }

  /** Previent le destinataire qu'il a manque un appel. */
  private async notifyMissedCall(call: ActiveCall): Promise<void> {
    const caller = await this.usersService.findByIdOrNull(call.callerId);
    if (!caller) return;
    await this.notificationsService
      .sendToUsers([call.calleeId], {
        title: caller.name,
        body:
          call.type === 'video'
            ? 'Appel vidéo manqué'
            : 'Appel manqué',
        data: { type: 'missed-call', callId: call.callId },
      })
      .catch(() => undefined);
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

  // ---- WebRTC call signaling ----

  @SubscribeMessage('call-initiate')
  async handleCallInitiate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { callId: string; calleeId: string; callType: string },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !data?.callId || !data?.calleeId) return;
    if (data.calleeId === userId) return;

    const callType = data.callType === 'video' ? 'video' : 'audio';

    // Le destinataire doit exister et partager l'organisation de l'appelant :
    // un identifiant est vite devine, le socket ne doit pas servir a sonner
    // chez n'importe qui.
    const [caller, callee] = await Promise.all([
      this.usersService.findByIdOrNull(userId),
      this.usersService.findByIdOrNull(data.calleeId),
    ]);
    if (!caller || !callee) return;
    if (
      !caller.organizationId ||
      caller.organizationId !== callee.organizationId
    ) {
      client.emit('call-unavailable', { callId: data.callId });
      return;
    }

    const calleeSockets = await this.server
      .in(userRoomKey(data.calleeId))
      .fetchSockets();

    await this.callState.set({
      callId: data.callId,
      callerId: userId,
      calleeId: data.calleeId,
      type: callType,
      startedAt: null,
    });

    if (calleeSockets.length > 0) {
      this.server.to(userRoomKey(data.calleeId)).emit('incoming-call', {
        callId: data.callId,
        callType,
        caller: {
          id: caller.id,
          name: caller.name,
          avatar: caller.avatar,
        },
      });
    }

    // Notification poussee meme quand un socket est ouvert : sur Android le
    // socket survit quelques minutes en arriere-plan mais l'ecran reste
    // eteint. L'application masque la banniere si elle sonne deja.
    await this.notificationsService
      .sendToUsers([data.calleeId], {
        title: caller.name,
        body:
          callType === 'video' ? 'Appel vidéo entrant' : 'Appel entrant',
        data: {
          type: 'incoming-call',
          callId: data.callId,
          callType,
        },
      })
      .catch(() => undefined);

    this.armRingTimer(data.callId);
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
      if (call.calleeId !== userId || call.startedAt) continue;
      const caller = await this.usersService.findByIdOrNull(call.callerId);
      if (!caller) continue;
      client.emit('incoming-call', {
        callId: call.callId,
        callType: call.type,
        caller: {
          id: caller.id,
          name: caller.name,
          avatar: caller.avatar,
        },
      });
      return;
    }
  }

  @SubscribeMessage('call-accept')
  async handleCallAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
    const userId = client.data.userId as string | undefined;
    const pending = await this.callState.get(data?.callId);
    // Seul le destinataire decroche : accepter a sa place ouvrirait le flux
    // media vers un tiers.
    if (!pending || !userId || pending.calleeId !== userId) return;

    this.clearRingTimer(data.callId);
    // markStarted relit, date et reecrit : avec une Map locale la mutation
    // par reference suffisait, plus maintenant que l'etat est partage.
    const call = await this.callState.markStarted(data.callId);
    if (!call) return;
    this.server
      .to(userRoomKey(call.callerId))
      .emit('call-accepted', { callId: data.callId });
  }

  @SubscribeMessage('call-reject')
  async handleCallReject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; busy?: boolean },
  ) {
    const userId = client.data.userId as string | undefined;
    const call = await this.callState.get(data?.callId);
    if (!call || !userId || call.calleeId !== userId) return;

    this.clearRingTimer(data.callId);
    this.server.to(userRoomKey(call.callerId)).emit('call-rejected', {
      callId: data.callId,
      busy: !!data.busy,
    });
    await this.recordCall(call, data.busy ? 'missed' : 'rejected');
    await this.callState.delete(data.callId);
  }

  @SubscribeMessage('call-cancel')
  async handleCallCancel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
    const userId = client.data.userId as string | undefined;
    const call = await this.callState.get(data?.callId);
    if (!call || !userId || call.callerId !== userId) return;

    this.clearRingTimer(data.callId);
    this.server
      .to(userRoomKey(call.calleeId))
      .emit('call-cancelled', { callId: data.callId });
    await this.recordCall(call, 'missed');
    await this.callState.delete(data.callId);
    await this.notifyMissedCall(call);
  }

  @SubscribeMessage('call-end')
  async handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
    const userId = client.data.userId as string | undefined;
    const call = await this.callState.get(data?.callId);
    if (!call || !userId) return;
    if (userId !== call.callerId && userId !== call.calleeId) return;

    this.clearRingTimer(data.callId);
    const otherId =
      userId === call.callerId ? call.calleeId : call.callerId;
    this.server
      .to(userRoomKey(otherId))
      .emit('call-ended', { callId: data.callId });
    await this.recordCall(call, call.startedAt ? 'completed' : 'missed');
    await this.callState.delete(data.callId);
  }

  /**
   * Relais de signalisation.
   *
   * Le destinataire est lu dans l'etat de l'appel et non dans le message :
   * un client pourrait sinon pousser une offre SDP vers n'importe quel
   * utilisateur connecte.
   */
  private async signalingTarget(
    client: Socket,
    callId: string,
  ): Promise<string | null> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !callId) return null;
    const call = await this.callState.get(callId);
    if (!call) return null;
    if (userId === call.callerId) return call.calleeId;
    if (userId === call.calleeId) return call.callerId;
    return null;
  }

  @SubscribeMessage('webrtc-offer')
  async handleWebrtcOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; sdp: unknown },
  ) {
    const to = await this.signalingTarget(client, data?.callId);
    if (!to) return;
    this.server
      .to(userRoomKey(to))
      .emit('webrtc-offer', { callId: data.callId, sdp: data.sdp });
  }

  @SubscribeMessage('webrtc-answer')
  async handleWebrtcAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; sdp: unknown },
  ) {
    const to = await this.signalingTarget(client, data?.callId);
    if (!to) return;
    this.server
      .to(userRoomKey(to))
      .emit('webrtc-answer', { callId: data.callId, sdp: data.sdp });
  }

  @SubscribeMessage('webrtc-ice')
  async handleWebrtcIce(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { callId: string; candidate: unknown },
  ) {
    const to = await this.signalingTarget(client, data?.callId);
    if (!to) return;
    this.server.to(userRoomKey(to)).emit('webrtc-ice', {
      callId: data.callId,
      candidate: data.candidate,
    });
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
