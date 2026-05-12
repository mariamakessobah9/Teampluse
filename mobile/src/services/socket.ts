import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { SOCKET_URL } from './api';

let socket: Socket | null = null;

export const connectSocket = async (): Promise<Socket> => {
  const token = await SecureStore.getItemAsync('token');

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  return socket;
};

export const getSocket = (): Socket | null => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
