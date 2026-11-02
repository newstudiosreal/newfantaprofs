// API del blocco "gioco": classifica per periodo, sfide, missioni a rotazione, pronostici di squadra,
// scambi multipli, preferiti. Le scritture passano sempre da funzioni server-side (RPC).
import { supabase } from './supabase';
import type { GameEvent, Forecast, Listing, Rotation } from './types';
import type { Duel, DuelLive, PeriodicMission, PeriodScore, SaleRecord, TeamForecast, TimelinePoint, WatchRow } from './types.game';

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

// ── Classifica per periodo ───────────────────────────────────────
export const teamScoresBetween = (leagueId: string, from: Date | null = null, to: Date | null = null) =>
  rpc<PeriodScore[]>('team_scores_between', { p_league: leagueId, p_from: from?.toISOString() ?? null, p_to: to?.toISOString() ?? null });

export const leagueTimeline = (leagueId: string) => rpc<TimelinePoint[]>('league_points_timeline', { p_league: leagueId });

export const listEventsSince = (leagueId: string, from: Date) =>
  rows<GameEvent>(supabase.from('events').select('*').eq('league_id', leagueId).gte('created_at', from.toISOString())
    .order('created_at', { ascending: false }).limit(1000));

// ── Sfide ────────────────────────────────────────────────────────
export const listDuels = async (leagueId: string) => {
  await resolveDuels(leagueId).catch(() => 0);
  return rows<Duel>(supabase.from('duels').select('*').eq('league_id', leagueId).order('created_at', { ascending: false }).limit(80));
};
export const duelLive = (leagueId: string) => rpc<DuelLive[]>('duel_live_points', { p_league: leagueId });
export const proposeDuel = (leagueId: string, opponentUser: string) => rpc<string>('propose_duel', { p_league: leagueId, p_opponent_user: opponentUser });
export const respondDuel = (duelId: string, accept: boolean) => rpc<string>('respond_duel', { p_duel: duelId, p_accept: accept });
export const cancelDuel = (duelId: string) => rpc('cancel_duel', { p_duel: duelId });
export const resolveDuels = (leagueId: string) => rpc<number>('resolve_duels', { p_league: leagueId });

// ── Missioni a rotazione ─────────────────────────────────────────
export const periodicMissions = (leagueId: string) => rpc<PeriodicMission[]>('periodic_missions', { p_league: leagueId });
export const claimPeriodicMission = (leagueId: string, key: string) => rpc<number>('claim_periodic_mission', { p_league: leagueId, p_key: key });

// ── Pronostici di squadra ────────────────────────────────────────
export const listTeamForecasts = async (leagueId: string, userId: string) =>
  rows<TeamForecast>(supabase.from('forecast_teams').select('*').eq('league_id', leagueId).eq('user_id', userId).order('week_start', { ascending: false }).limit(40));
export const makeTeamForecast = (leagueId: string, teamId: string) => rpc('make_team_forecast', { p_league: leagueId, p_team: teamId });
export const listMyForecasts = (leagueId: string, userId: string) =>
  rows<Forecast>(supabase.from('forecasts').select('*').eq('league_id', leagueId).eq('user_id', userId).order('week_start', { ascending: false }).limit(60));

// ── Scambi (fino a 2 prof per lato) e controfferta ───────────────
export const proposeTradeMulti = (leagueId: string, toUser: string, fromProfs: string[], toProfs: string[]) =>
  rpc<string>('propose_trade', {
    p_league: leagueId, p_to_user: toUser, p_from_prof: fromProfs[0], p_to_prof: toProfs[0],
    p_from_prof2: fromProfs[1] ?? null, p_to_prof2: toProfs[1] ?? null,
  });
export const counterTrade = (tradeId: string, giveProfs: string[], askProfs: string[]) =>
  rpc<string>('counter_trade', { p_trade: tradeId, p_from_profs: giveProfs, p_to_profs: askProfs });

// ── Preferiti e storico prezzi ───────────────────────────────────
export const listWatchlist = (userId: string, leagueId: string) =>
  rows<WatchRow>(supabase.from('watchlist').select('*').eq('user_id', userId).eq('league_id', leagueId));
export const toggleWatch = (profId: string) => rpc<boolean>('toggle_watch', { p_prof: profId });

export async function professorSales(profId: string): Promise<SaleRecord[]> {
  const [sold, rot] = await Promise.all([
    rows<Listing>(supabase.from('market_listings').select('*').eq('professor_id', profId).eq('status', 'sold').order('created_at', { ascending: false }).limit(20)),
    rows<Rotation>(supabase.from('market_rotations').select('*').eq('professor_id', profId).not('bought_by', 'is', null).order('batch_at', { ascending: false }).limit(20)),
  ]);
  return [
    ...sold.filter(l => l.sold_for != null).map<SaleRecord>(l => ({ kind: 'listing', price: l.sold_for!, at: l.created_at, buyer_id: l.sold_to, seller_id: l.seller_id })),
    ...rot.map<SaleRecord>(r => ({ kind: 'rotation', price: r.price, at: r.batch_at, buyer_id: r.bought_by, seller_id: null })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

// ── Manutenzione "pigra" ─────────────────────────────────────────
const lastTick = new Map<string, number>();
/** Chiude le sfide scadute e avvisa per le aste in scadenza. Best effort, al massimo una volta al minuto per lega. */
export async function tickLeague(leagueId: string, force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - (lastTick.get(leagueId) ?? 0) < 60_000) return;
  lastTick.set(leagueId, now);
  await Promise.allSettled([resolveDuels(leagueId), rpc('notify_ending_auctions', { p_league: leagueId })]);
}
