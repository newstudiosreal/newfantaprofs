import type { Message } from './types';

export type CoadminPerm = 'events' | 'members' | 'missions';
export type CoadminPerms = Partial<Record<CoadminPerm, boolean>>;

export const COADMIN_PERM_LABELS: Record<CoadminPerm, { label: string; desc: string }> = {
  events: { label: 'Eventi e proposte', desc: 'Registrare ed eliminare eventi, gestire il catalogo, approvare le proposte dei giocatori' },
  members: { label: 'Membri', desc: 'Espellere i giocatori dalla lega' },
  missions: { label: 'Missioni', desc: 'Creare ed eliminare missioni, approvare le richieste' },
};

export type ProposalStatus = 'pending' | 'approved' | 'rejected';
export interface EventProposal {
  id: string; league_id: string; proposer_id: string; professor_id: string; event_key: string; note: string;
  status: ProposalStatus; reviewed_by: string | null; reviewed_at: string | null; created_at: string;
}

/** Messaggio di chat con i campi aggiunti dalla migrazione 007. */
export interface ChatMessage extends Message {
  reply_to: string | null;
  pinned_at: string | null;
  pinned_by: string | null;
}
export interface MessageReaction { message_id: string; user_id: string; emoji: string }
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🔥', '👏'] as const;

export interface LeaguePoll {
  id: string; author_id: string; question: string; options: string[]; closes_at: string; created_at: string;
  counts: number[]; total: number; my_vote: number | null;
}

export interface FollowStats { following: number; followers: number; i_follow: boolean }
export interface FollowEntry {
  user_id: string; username: string; avatar: string; avatar_url: string | null; verified: boolean; direction: 'following' | 'follower';
}
export interface FeedItem { at: string; kind: 'mercato' | 'scambio' | 'stagione' | 'sfida' | string; text: string; league_id: string; user_id: string }

export interface BannedWord { word: string; created_at: string }
export interface ClientErrorRow {
  id: string; user_id: string | null; username: string | null; message: string; stack: string | null;
  url: string | null; user_agent: string | null; created_at: string;
}
export interface PublicStats { leagues: number; players: number; events: number }
