import { supabase } from './supabase';
import type { GameEvent } from './types';
import type {
  BannedWord, ChatMessage, ClientErrorRow, CoadminPerms, EventProposal, FeedItem, FollowEntry, FollowStats, LeaguePoll,
  MessageReaction, PublicStats,
} from './types.social';

async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}
async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data as T[] | null) ?? [];
}

// ── Permessi co-admin, registrazione eventi in blocco, undo ──────
export const setCoadminPerms = (leagueId: string, perms: CoadminPerms) =>
  rpc('set_coadmin_perms', { p_league: leagueId, p_perms: perms });
export const undoLastEvents = (leagueId: string) => rpc<number>('undo_last_events', { p_league: leagueId });

export interface BulkItem { professor_id: string; event_key: string }
/** Prodotto cartesiano professori × eventi. */
export const crossProduct = (profIds: string[], eventKeys: string[]): BulkItem[] =>
  profIds.flatMap(professor_id => eventKeys.map(event_key => ({ professor_id, event_key })));

/** Registra più eventi: add_events accetta max 100 voci per chiamata, quindi si spezza in blocchi. */
export async function registerEventsBulk(leagueId: string, items: BulkItem[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < items.length; i += 100) {
    n += await rpc<number>('add_events', { p_league: leagueId, p_events: items.slice(i, i + 100) });
  }
  return n;
}
export const listAllEvents = (leagueId: string, limit = 5000) =>
  rows<GameEvent>(supabase.from('events').select('*').eq('league_id', leagueId).order('created_at', { ascending: false }).limit(limit));

// ── Proposte ─────────────────────────────────────────────────────
export const proposeEvent = (leagueId: string, profId: string, eventKey: string, note: string) =>
  rpc<string>('propose_event', { p_league: leagueId, p_prof: profId, p_event_key: eventKey, p_note: note });
export const reviewProposal = (id: string, approve: boolean) => rpc('review_proposal', { p_id: id, p_approve: approve });
export const listProposals = (leagueId: string) =>
  rows<EventProposal>(supabase.from('event_proposals').select('*').eq('league_id', leagueId).order('created_at', { ascending: false }).limit(100));

// ── Chat ─────────────────────────────────────────────────────────
export const sendChatMessage = (leagueId: string, body: string, replyTo?: string | null) =>
  rpc<string>('send_message', { p_league: leagueId, p_body: body, p_reply_to: replyTo ?? null });
export const listChatMessages = (leagueId: string, limit = 100) =>
  rows<ChatMessage>(supabase.from('messages').select('*').eq('league_id', leagueId).order('created_at', { ascending: false }).limit(limit));
export const toggleReaction = (messageId: string, emoji: string) => rpc<boolean>('toggle_reaction', { p_msg: messageId, p_emoji: emoji });
export const pinMessage = (id: string) => rpc('pin_message', { p_msg: id });
export const unpinMessage = (id: string) => rpc('unpin_message', { p_msg: id });
export const listReactions = (messageIds: string[]) =>
  messageIds.length ? rows<MessageReaction>(supabase.from('message_reactions').select('message_id, user_id, emoji').in('message_id', messageIds)) : Promise.resolve([]);

export const listPolls = (leagueId: string) => rpc<LeaguePoll[]>('league_polls', { p_league: leagueId });
export const createPoll = (leagueId: string, question: string, options: string[], hours: number) =>
  rpc<string>('create_poll', { p_league: leagueId, p_question: question, p_options: options, p_hours: hours });
export const votePoll = (pollId: string, idx: number) => rpc('vote_poll', { p_poll: pollId, p_idx: idx });
export const deletePoll = (pollId: string) => rpc('delete_poll', { p_poll: pollId });

// ── Follow ───────────────────────────────────────────────────────
export const toggleFollow = (userId: string) => rpc<boolean>('toggle_follow', { p_target: userId });
export const followStats = (userId: string) => rpc<FollowStats[]>('follow_stats', { p_user: userId }).then(r => r[0] ?? { following: 0, followers: 0, i_follow: false });
export const myFollows = () => rpc<FollowEntry[]>('my_follows');
export const followFeed = (limit = 50) => rpc<FeedItem[]>('follow_feed_recent', { p_limit: limit });

// ── SuperAdmin: parole vietate, errori ───────────────────────────
export const adminListBannedWords = () => rpc<BannedWord[]>('admin_list_banned_words');
export const adminAddBannedWord = (word: string) => rpc('admin_add_banned_word', { p_word: word });
export const adminRemoveBannedWord = (word: string) => rpc('admin_remove_banned_word', { p_word: word });
export const adminListClientErrors = (limit = 100) => rpc<ClientErrorRow[]>('admin_list_client_errors', { p_limit: limit });
export const adminDeleteClientError = (id: string) => rpc('admin_delete_client_error', { p_id: id });
export const reportClientError = (message: string, stack: string | null, url: string) =>
  rpc('report_client_error', { p_message: message, p_stack: stack, p_url: url });

// ── Push e statistiche pubbliche ─────────────────────────────────
export const savePushSubscription = (endpoint: string, p256dh: string, auth: string) =>
  rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
export const deletePushSubscription = (endpoint: string) => rpc('delete_push_subscription', { p_endpoint: endpoint });
export const publicStats = () => rpc<PublicStats>('public_stats');
