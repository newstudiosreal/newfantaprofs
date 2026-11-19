export type TokenStatus = 'available' | 'badge_pending' | 'redeemed';
export type BadgeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** Token non ancora riscattato, come lo restituisce il server. */
export interface TokenOpen { id: string; status: TokenStatus; seen: boolean; found_at: string }
export interface TokenVisitResult { found: boolean; open: TokenOpen | null }

export interface TokenFind {
  id: string; user_id: string; status: TokenStatus; probability: number; seen_at: string | null;
  reward_key: string | null; code: string | null; redeemed_at: string | null; found_at: string;
}
export interface TokenBadgeRequest {
  id: string; token_id: string; user_id: string; text: string; description: string; status: BadgeRequestStatus;
  final_text: string | null; admin_note: string; reviewed_by: string | null; reviewed_at: string | null; created_at: string;
}
export interface TokenOptions { status: TokenStatus; eligible: string[]; pro_leagues: { id: string; name: string }[] }
export interface TokenConfig { enabled: boolean; probability: number; visits_required: number; min_gap_minutes: number; eligible: string[] }
export interface TokenStats {
  finds: number; open: number; badge_pending: number; redeemed: number; users_with: number;
  requests_pending: number; valid_visits: number; checks: number; by_reward: Record<string, number>;
}
