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
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'voice';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  status: 'sent' | 'delivered' | 'read';
  deletedForEveryone?: boolean;
  sender: User;
  senderId: string;
  chatRoomId: string;
  createdAt: string;
}

export interface Call {
  id: string;
  caller: User;
  callerId: string;
  callee: User;
  calleeId: string;
  type: 'audio' | 'video';
  status: 'completed' | 'missed' | 'rejected';
  duration: number;
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
  NewChat: undefined;
  NewGroup: undefined;
  ChatRoom: { roomId: string; roomName: string };
  GroupSettings: { roomId: string };
  UserProfile: { userId: string };
  CallDetail: { call: Call };
};

export type MainTabParamList = {
  Chats: undefined;
  Teams: undefined;
  Calls: undefined;
  Settings: undefined;
};
