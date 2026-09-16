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
      this.server
        .to(userRoomKey(otherId))
        .emit('call-ended', { callId: call.callId });
      await this.recordCall(call, call.startedAt ? 'completed' : 'missed');
      await this.callState.delete(call.callId);
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
    if (!userId) return;

    const calleeSockets = await this.server
      .in(userRoomKey(data.calleeId))
      .fetchSockets();

    if (calleeSockets.length === 0) {
      client.emit('call-unavailable', { callId: data.callId });
      await this.callsService
        .record({
          callerId: userId,
          calleeId: data.calleeId,
          type: data.callType,
          status: 'missed',
        })
        .catch(() => undefined);
      return;
    }

    await this.callState.set({
      callId: data.callId,
      callerId: userId,
      calleeId: data.calleeId,
      type: data.callType,
      startedAt: null,
    });

    const caller = await this.usersService.findById(userId);
    this.server.to(userRoomKey(data.calleeId)).emit('incoming-call', {
      callId: data.callId,
      callType: data.callType,
      caller: {
        id: caller.id,
        name: caller.name,
        avatar: caller.avatar,
      },
    });
  }

  @SubscribeMessage('call-accept')
  async handleCallAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
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
    @MessageBody() data: { callId: string },
  ) {
    const call = await this.callState.get(data.callId);
    if (!call) return;
    this.server
      .to(userRoomKey(call.callerId))
      .emit('call-rejected', { callId: data.callId });
    await this.recordCall(call, 'rejected');
    await this.callState.delete(data.callId);
  }

  @SubscribeMessage('call-cancel')
  async handleCallCancel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
    const call = await this.callState.get(data.callId);
    if (!call) return;
    this.server
      .to(userRoomKey(call.calleeId))
      .emit('call-cancelled', { callId: data.callId });
    await this.recordCall(call, 'missed');
    await this.callState.delete(data.callId);
  }

  @SubscribeMessage('call-end')
  async handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
    const call = await this.callState.get(data.callId);
    if (!call) return;
    const userId = client.data.userId as string | undefined;
    const otherId =
      userId === call.callerId ? call.calleeId : call.callerId;
    this.server
      .to(userRoomKey(otherId))
      .emit('call-ended', { callId: data.callId });
    await this.recordCall(call, call.startedAt ? 'completed' : 'missed');
    await this.callState.delete(data.callId);
  }

  @SubscribeMessage('webrtc-offer')
  handleWebrtcOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; to: string; sdp: unknown },
  ) {
    this.server
      .to(userRoomKey(data.to))
      .emit('webrtc-offer', { callId: data.callId, sdp: data.sdp });
  }

  @SubscribeMessage('webrtc-answer')
  handleWebrtcAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; to: string; sdp: unknown },
  ) {
    this.server
      .to(userRoomKey(data.to))
      .emit('webrtc-answer', { callId: data.callId, sdp: data.sdp });
  }

  @SubscribeMessage('webrtc-ice')
  handleWebrtcIce(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { callId: string; to: string; candidate: unknown },
  ) {
    this.server.to(userRoomKey(data.to)).emit('webrtc-ice', {
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
