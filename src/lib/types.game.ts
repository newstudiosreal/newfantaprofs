import type { Forecast } from './types';

export interface PeriodScore { team_id: string; owner_id: string; name: string; captain_id: string | null; score: number }
export interface TimelinePoint { day: string; team_id: string; pts: number }

export type DuelStatus = 'pending' | 'active' | 'declined' | 'cancelled' | 'finished';
export interface Duel {
  id: string; league_id: string; challenger_team: string; opponent_team: string; challenger_user: string; opponent_user: string;
  status: DuelStatus; created_at: string; starts_at: string | null; ends_at: string | null;
  challenger_pts: number | null; opponent_pts: number | null; winner_team: string | null;
}
export interface DuelLive { duel_id: string; challenger_pts: number; opponent_pts: number }

export interface PeriodicMission {
  key: string; period: 'daily' | 'weekly'; label: string; description: string;
  target: number; progress: number; reward: number; claimed: boolean; period_start: string; ends_at: string;
}

export interface TeamForecast {
  league_id: string; user_id: string; week_start: string; team_id: string; resolved: boolean; won: boolean | null; created_at: string;
}
export type ForecastRow = Forecast;

export interface WatchRow { user_id: string; league_id: string; professor_id: string }
export interface SaleRecord { kind: 'listing' | 'rotation'; price: number; at: string; buyer_id: string | null; seller_id: string | null }
