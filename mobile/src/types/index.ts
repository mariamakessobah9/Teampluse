export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  isOnline: boolean;
  isVerified: boolean;
  createdAt: string;
}

export interface ChatRoom {
  id: string;
  name?: string;
  type: 'direct' | 'group';
  avatar?: string;
  members: User[];
  adminId?: string;
  lastMessage?: Message;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'voice';
  fileUrl?: string;
  status: 'sent' | 'delivered' | 'read';
  sender: User;
  senderId: string;
  chatRoomId: string;
  createdAt: string;
}

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Login: undefined;
  Register: undefined;
  OTP: { email: string };
  ForgotPassword: undefined;
  ResetPassword: { email: string };
  ChatRoom: { roomId: string; roomName: string };
};

export type MainTabParamList = {
  Chats: undefined;
  Teams: undefined;
  Calls: undefined;
  Settings: undefined;
};
