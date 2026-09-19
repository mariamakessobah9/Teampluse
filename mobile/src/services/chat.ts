import api from './api';
import { ChatRoom, Message } from '../types';

/** Message trouvé, accompagné du salon qui le contient. */
export type MessageHit = Message & { chatRoom?: ChatRoom };

/** Canaux ouverts de l'organisation que l'on n'a pas encore rejoints. */
export const getDiscoverableChannels = async (): Promise<ChatRoom[]> =>
  (await api.get('/chat/channels')).data;

export const joinChannel = async (roomId: string): Promise<ChatRoom> =>
  (await api.post(`/chat/rooms/${roomId}/join`)).data;

/**
 * Recherche plein texte, restreinte côté serveur aux conversations dont on
 * est membre.
 */
export const searchMessages = async (q: string): Promise<MessageHit[]> =>
  (await api.get('/chat/search', { params: { q } })).data;
