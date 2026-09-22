export type OrgRole = 'owner' | 'admin' | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  role: OrgRole;
  organizationId?: string | null;
  isActive?: boolean;
  isOnline: boolean;
  isVerified: boolean;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  /** Domaines dont les adresses rejoignent l'organisation sans invitation. */
  allowedDomains: string[] | null;
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  token: string;
  role: OrgRole;
  expiresAt: string;
  createdAt: string;
}

/** Aperçu public d'une invitation, avant création du compte. */
export interface InvitationPreview {
  email: string;
  role: OrgRole;
  organizationName: string;
  expiresAt: string;
}

export interface ChatRoom {
  id: string;
  name?: string;
  type: 'direct' | 'group';
  /** Canal ouvert : visible et rejoignable par toute l'organisation. */
  isPublic?: boolean;
  description?: string | null;
  organizationId?: string | null;
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

export interface CallParticipant {
  id: string;
  userId: string;
  user: User;
  /** joined = a participe, declined = a refuse, missed = n'a pas repondu */
  status: 'joined' | 'declined' | 'missed';
  isInitiator: boolean;
  duration: number;
}

export interface Call {
  id: string;
  caller: User;
  callerId: string;
  /** Nul pour un appel de groupe. */
  callee: User | null;
  calleeId: string | null;
  mode?: 'direct' | 'group';
  /** Salon a l'origine d'un appel de groupe. */
  chatRoomId?: string | null;
  participants?: CallParticipant[];
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
  Organization: undefined;
  Search: undefined;
  NewCall: undefined;
  CallDetail: { call: Call };
};

export type MainTabParamList = {
  Chats: undefined;
  Teams: undefined;
  Calls: undefined;
  Settings: undefined;
};
