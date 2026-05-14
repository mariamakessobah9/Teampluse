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
import { ChatRoom } from './entities/chat-room.entity';

const userRoomKey = (userId: string) => `user:${userId}`;

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, string>(); // socketId -> userId

  constructor(
    private readonly chatService: ChatService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
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

      this.connectedUsers.set(client.id, userId);
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
    const userId = this.connectedUsers.get(client.id);
    if (userId) {
      this.connectedUsers.delete(client.id);
      await this.usersService.setOnlineStatus(userId, false);
      this.server.emit('user-offline', { userId });
      console.log(`User ${userId} disconnected`);
    }
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    client.join(data.roomId);
    const userId = this.connectedUsers.get(client.id);

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
    const userId = this.connectedUsers.get(client.id);
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
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isTyping: boolean },
  ) {
    const userId = this.connectedUsers.get(client.id);
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
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    await this.chatService.markMessagesAsRead(data.roomId, userId);
    this.server.to(data.roomId).emit('messages-read', {
      roomId: data.roomId,
      userId,
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
}
