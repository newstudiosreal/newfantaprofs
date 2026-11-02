import { supabase } from './supabase';
import type { ChangeUsernameResult, RecoverResult, SeasonResult } from './types.account';

async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

/** Estrae il messaggio d'errore JSON restituito da una Edge Function (anche con status non 2xx). */
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const j = await ctx.json() as { error?: string }; if (j?.error) msg = j.error; } catch { /* usa il messaggio base */ }
    }
    throw new Error(msg || 'Servizio non raggiungibile');
  }
  return data as T;
}

// ── Codice di recupero ───────────────────────────────────────────
export const issueRecoveryCode = () => rpc<string>('issue_recovery_code');
export const hasRecoveryCode = () => rpc<boolean>('has_recovery_code');
export const recoverPassword = (username: string, code: string, password: string) =>
  invoke<RecoverResult>('recover-password', { username: username.trim(), code: code.trim(), password });

// ── Username ─────────────────────────────────────────────────────
export const changeUsername = (username: string) => invoke<ChangeUsernameResult>('change-username', { username: username.trim() });

// ── Stagioni ─────────────────────────────────────────────────────
export const ensureSeason = (leagueId: string) => rpc<boolean>('ensure_season', { p_league: leagueId });
export const closeSeason = (leagueId: string) => rpc('close_season', { p_league: leagueId });
export const setSeasonAuto = (leagueId: string, auto: boolean) => rpc('set_season_auto', { p_league: leagueId, p_auto: auto });
export const rebuildTeam = (teamId: string, profIds: string[]) => rpc('rebuild_team', { p_team: teamId, p_prof_ids: profIds });

export async function listSeasonResults(leagueId: string): Promise<SeasonResult[]> {
  const { data, error } = await supabase.from('season_results').select('*').eq('league_id', leagueId)
    .order('season_num', { ascending: false }).order('rank');
  if (error) throw error;
  return (data as SeasonResult[] | null) ?? [];
}
