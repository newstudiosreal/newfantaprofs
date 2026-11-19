import { supabase } from './supabase';
import type {
  TokenBadgeRequest, TokenConfig, TokenFind, TokenOpen, TokenOptions, TokenStats, TokenVisitResult,
} from './types.token';

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

// ── Utente ───────────────────────────────────────────────────────
/** Segnala un'apertura dell'app. Il server decide se conta come accesso valido e se il Token è stato trovato. */
export const registerTokenVisit = () => rpc<TokenVisitResult>('token_register_visit');
export const markTokenSeen = (tokenId: string) => rpc('token_mark_seen', { p_token: tokenId });
export const getTokenOptions = (tokenId: string) => rpc<TokenOptions>('token_reward_options', { p_token: tokenId });
export const claimToken = (tokenId: string, reward: string, leagueId?: string) =>
  rpc<{ reward: string; code: string }>('token_claim', { p_token: tokenId, p_reward: reward, p_league: leagueId ?? null });
export const requestTokenBadge = (tokenId: string, text: string, description: string) =>
  rpc<string>('token_request_badge', { p_token: tokenId, p_text: text.trim(), p_description: description.trim() });
export const cancelTokenBadgeRequest = (requestId: string) => rpc('token_cancel_badge_request', { p_request: requestId });

export async function getOpenToken(userId: string): Promise<TokenOpen | null> {
  const r = await rows<TokenFind>(supabase.from('token_finds').select('*').eq('user_id', userId).neq('status', 'redeemed').limit(1));
  const f = r[0];
  return f ? { id: f.id, status: f.status, seen: f.seen_at != null, found_at: f.found_at } : null;
}
export const listMyTokenFinds = (userId: string) =>
  rows<TokenFind>(supabase.from('token_finds').select('*').eq('user_id', userId).order('found_at', { ascending: false }));
export const listMyBadgeRequests = (userId: string) =>
  rows<TokenBadgeRequest>(supabase.from('token_badge_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }));

// ── SuperAdmin ───────────────────────────────────────────────────
export const adminGetTokenConfig = () => rpc<TokenConfig>('token_admin_get_config');
export const adminSetTokenConfig = (c: TokenConfig) => rpc<TokenConfig>('token_admin_set_config', { p_config: c });
export const adminTokenStats = () => rpc<TokenStats>('token_admin_stats');
export const adminListTokenFinds = () =>
  rows<TokenFind>(supabase.from('token_finds').select('*').order('found_at', { ascending: false }).limit(500));
export const adminListBadgeRequests = () =>
  rows<TokenBadgeRequest>(supabase.from('token_badge_requests').select('*').order('created_at', { ascending: false }).limit(300));
export const adminReviewBadge = (requestId: string, approve: boolean, text: string | null, note: string) =>
  rpc<{ status: string; final_text?: string }>('token_admin_review_badge', { p_request: requestId, p_approve: approve, p_text: text, p_note: note });
