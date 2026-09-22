import { Call, ChatRoom, User } from '../types';
import type { CallTarget } from '../services/callManager';

export interface CallSummary {
  isGroup: boolean;
  isOutgoing: boolean;
  /** Nom affiche : le correspondant, le salon, ou les prenoms des participants. */
  title: string;
  /** Visage de la ligne ; nul pour un groupe, qui affiche une icone. */
  avatarUser: User | null;
  /** Les autres participants, pour le detail et pour rappeler. */
  others: User[];
  /** Appel que j'ai manque (et non pas un appel que j'ai passe sans reponse). */
  missedByMe: boolean;
  /** De quoi relancer le meme appel. */
  target: CallTarget | null;
}

const firstNames = (users: User[]) => {
  const names = users.map((u) => u.name.split(' ')[0]);
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} et ${names.length - 2} autres`;
};

/**
 * Lecture d'une ligne d'historique, commune a la liste et au detail.
 *
 * Un appel de groupe n'a pas de destinataire unique : le titre vient du
 * salon d'origine s'il existe encore, sinon des participants.
 */
export function summarizeCall(
  call: Call,
  myId: string | undefined,
  rooms: ChatRoom[],
): CallSummary {
  const isOutgoing = call.callerId === myId;
  const isGroup = call.mode === 'group';
  const participants = call.participants ?? [];
  const mine = participants.find((p) => p.userId === myId);

  const others: User[] = participants.length
    ? participants.filter((p) => p.userId !== myId).map((p) => p.user)
    : [isOutgoing ? call.callee : call.caller].filter(
        (u): u is User => !!u,
      );

  const missedByMe = mine
    ? !mine.isInitiator && mine.status === 'missed'
    : call.status === 'missed' && !isOutgoing;

  if (!isGroup) {
    const other =
      (isOutgoing ? call.callee : call.caller) ?? others[0] ?? null;
    return {
      isGroup,
      isOutgoing,
      title: other?.name || 'Inconnu',
      avatarUser: other,
      others: other ? [other] : [],
      missedByMe,
      target: other
        ? { peers: [{ id: other.id, name: other.name, avatar: other.avatar }] }
        : null,
    };
  }

  const room = call.chatRoomId
    ? rooms.find((r) => r.id === call.chatRoomId)
    : undefined;
  const title = room?.name || firstNames(others) || 'Appel de groupe';
  return {
    isGroup,
    isOutgoing,
    title,
    avatarUser: null,
    others,
    missedByMe,
    target: room
      ? { roomId: room.id, title }
      : others.length
        ? {
            peers: others.map((u) => ({
              id: u.id,
              name: u.name,
              avatar: u.avatar,
            })),
          }
        : null,
  };
}
