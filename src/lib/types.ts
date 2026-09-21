export interface Profile {
  id: string;
  username: string;
  avatar: string;
  avatar_url: string | null;
  bio: string;
  is_superadmin: boolean;
  banned_until: string | null;
  created_at: string;
}

export interface CatalogEvent { id: string; label: string; pts: number; maxPerWeek?: number | null }

export interface League {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  suspended: boolean;
  season_start: string;
  bonus: CatalogEvent[];
  malus: CatalogEvent[];
  premi: CatalogEvent[];
  missions_enabled: boolean;
  created_at: string;
}

export interface Member { league_id: string; user_id: string; role: 'member' | 'coadmin'; joined_at: string }
export interface Professor { id: string; league_id: string; name: string; subject: string; cost: number }
export interface Team {
  id: string; league_id: string; owner_id: string; name: string;
  captain_id: string | null; name_fx: 'glitch' | 'neon' | 'rainbow' | null; created_at: string;
}
export interface TeamProfessor { team_id: string; professor_id: string }
export interface TeamScore { team_id: string; league_id: string; owner_id: string; name: string; captain_id: string | null; score: number }

export type EventKind = 'bm' | 'premio' | 'mission' | 'forecast' | 'shop' | 'other';
export interface GameEvent {
  id: string; league_id: string; professor_id: string | null; team_id: string | null;
  event_key: string; label: string; kind: EventKind; pts: number; created_by: string | null; created_at: string;
}

export type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
export interface Trade {
  id: string; league_id: string; from_user: string; to_user: string; from_prof: string; to_prof: string;
  status: TradeStatus; created_at: string; expires_at: string;
}

export interface Message { id: string; league_id: string; author_id: string; body: string; created_at: string }
export interface Announcement { id: string; title: string; body: string; tag: string; pinned: boolean; created_at: string }

export type MissionType = 'auto_pos' | 'auto_pts' | 'auto_trades' | 'manual';
export interface Mission {
  id: string; league_id: string; label: string; description: string; type: MissionType; condition: number | null;
  reward: 'pts' | 'badge'; reward_pts: number | null; reward_badge: string | null; reward_label: string;
}
export interface MissionClaim {
  id: string; league_id: string; mission_id: string; user_id: string; note: string;
  status: 'pending' | 'approved' | 'rejected'; auto: boolean; created_at: string;
}

export type ListingStatus = 'open' | 'sold' | 'expired' | 'unsold' | 'cancelled';
export interface Listing {
  id: string; league_id: string; professor_id: string; seller_id: string; seller_team_id: string | null;
  type: 'direct' | 'auction'; price: number | null; min_bid: number | null; current_bid: number | null;
  current_bidder: string | null; status: ListingStatus; sold_to: string | null; sold_for: number | null;
  expires_at: string | null; created_at: string;
}
export interface Rotation { id: string; league_id: string; professor_id: string; price: number; bought_by: string | null; batch_at: string }
export interface Powerup { id: string; league_id: string; team_id: string; user_id: string; kind: 'shield' | 'multiplier'; expires_at: string | null; used_at: string | null; created_at: string }
export interface Forecast { league_id: string; user_id: string; week_start: string; professor_id: string; resolved: boolean }
export interface Entitlement { id: string; user_id: string; kind: 'pro' | 'skin' | 'badge' | 'name_fx' | 'custom_badge'; ref: string }
export interface HofRow { user_id: string; username: string; avatar: string; avatar_url: string | null; total: number; leagues: number }
export interface PremiumCode { code: string; type: string; meta: Record<string, string>; used_by: string | null; used_at: string | null; created_at: string }
