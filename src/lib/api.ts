import { supabase } from './supabase';
import type {
  Announcement, Entitlement, Forecast, GameEvent, HofRow, League, Listing, Member, Message, Mission,
  MissionClaim, Powerup, PremiumCode, Professor, Profile, Rotation, Team, TeamProfessor, TeamScore, Trade,
} from './types';

/** Esegue una funzione RPC e lancia l'errore originale (con hint/code) se fallisce. */
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

// ── Letture ──────────────────────────────────────────────────────
export interface ProfessorScore { professor_id: string; league_id: string; pts: number; events: number }

export interface LeagueBundle {
  league: League;
  members: Member[];
  profiles: Record<string, Profile>;
  professors: Professor[];
  teams: Team[];
  teamProfessors: TeamProfessor[];
  scores: TeamScore[];
  profScores: Record<string, ProfessorScore>;
  proOwner: boolean;
}

export async function loadLeagueBundle(leagueId: string): Promise<LeagueBundle> {
  const [leagues, members, professors, teams, teamProfessors, scores, profScores] = await Promise.all([
    rows<League>(supabase.from('leagues').select('*').eq('id', leagueId)),
    rows<Member>(supabase.from('league_members').select('*').eq('league_id', leagueId)),
    rows<Professor>(supabase.from('professors').select('*').eq('league_id', leagueId).order('name')),
    rows<Team>(supabase.from('teams').select('*').eq('league_id', leagueId)),
    rows<TeamProfessor & { teams: { league_id: string } }>(
      supabase.from('team_professors').select('team_id, professor_id, teams!inner(league_id)').eq('teams.league_id', leagueId)),
    rows<TeamScore>(supabase.from('team_scores').select('*').eq('league_id', leagueId).order('score', { ascending: false })),
    rows<ProfessorScore>(supabase.from('professor_scores').select('*').eq('league_id', leagueId)),
  ]);
  const league = leagues[0];
  if (!league) throw new Error('Lega non trovata o non accessibile');
  const ids = members.map(m => m.user_id);
  const [profs, pro] = await Promise.all([
    rows<Profile>(supabase.from('profiles').select('*').in('id', ids)),
    rows<Entitlement>(supabase.from('entitlements').select('*').eq('kind', 'pro').eq('ref', leagueId).eq('user_id', league.owner_id)),
  ]);
  return {
    league, members, professors, teams,
    teamProfessors: teamProfessors.map(({ team_id, professor_id }) => ({ team_id, professor_id })),
    scores,
    profScores: Object.fromEntries(profScores.map(p => [p.professor_id, p])),
    profiles: Object.fromEntries(profs.map(p => [p.id, p])),
    proOwner: pro.length > 0,
  };
}

export const listMyLeagues = () =>
  rows<League>(supabase.from('leagues').select('*').order('created_at', { ascending: false }));

export const listMyMemberships = (userId: string) =>
  rows<Member>(supabase.from('league_members').select('*').eq('user_id', userId));

export const listMyTeams = (userId: string) =>
  rows<TeamScore>(supabase.from('team_scores').select('*').eq('owner_id', userId));

export const leagueRanks = async (leagueIds: string[]) =>
  leagueIds.length ? rows<TeamScore>(supabase.from('team_scores').select('*').in('league_id', leagueIds)) : [];

export const listEvents = (leagueId: string, limit = 150) =>
  rows<GameEvent>(supabase.from('events').select('*').eq('league_id', leagueId).order('created_at', { ascending: false }).limit(limit));

export const listProfessorEvents = (professorId: string) =>
  rows<GameEvent>(supabase.from('events').select('*').eq('professor_id', professorId).order('created_at', { ascending: false }).limit(100));

export const listTrades = async (leagueId: string) => {
  await supabase.rpc('expire_trades');
  return rows<Trade>(supabase.from('trades').select('*').eq('league_id', leagueId).order('created_at', { ascending: false }).limit(60));
};

export const listMessages = (leagueId: string, limit = 100) =>
  rows<Message>(supabase.from('messages').select('*').eq('league_id', leagueId).order('created_at', { ascending: false }).limit(limit));

export const listListings = async (leagueId: string) => {
  await rpc('expire_market', { p_league: leagueId });
  return rows<Listing>(supabase.from('market_listings').select('*').eq('league_id', leagueId).order('created_at', { ascending: false }).limit(100));
};

export const listRotations = async (leagueId: string) => {
  await rpc('refresh_rotating_market', { p_league: leagueId });
  return rows<Rotation>(supabase.from('market_rotations').select('*').eq('league_id', leagueId).order('price'));
};

export const listPowerups = (leagueId: string, userId: string) =>
  rows<Powerup>(supabase.from('powerups').select('*').eq('league_id', leagueId).eq('user_id', userId).is('used_at', null));

export const listMissions = (leagueId: string) =>
  rows<Mission>(supabase.from('missions').select('*').eq('league_id', leagueId).order('created_at'));

export const listClaims = (leagueId: string) =>
  rows<MissionClaim>(supabase.from('mission_claims').select('*').eq('league_id', leagueId).order('created_at', { ascending: false }));

export const listForecasts = async (leagueId: string) => {
  await rpc('resolve_forecasts', { p_league: leagueId });
  return rows<Forecast>(supabase.from('forecasts').select('*').eq('league_id', leagueId).order('week_start', { ascending: false }).limit(60));
};

export const listEntitlements = (userId: string) =>
  rows<Entitlement>(supabase.from('entitlements').select('*').eq('user_id', userId));

export const listAnnouncements = () =>
  rows<Announcement>(supabase.from('announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }));

export const hallOfFame = () => rpc<HofRow[]>('hall_of_fame');

export const getProfileByUsername = async (username: string) => {
  const { data, error } = await supabase.from('profiles').select('*').eq('username', username).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
};

export const getSetting = async <T>(key: string, fallback: T): Promise<T> => {
  const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as T) ?? fallback;
};

// ── Scritture (tutte passano da funzioni server-side) ────────────
export const createLeague = (name: string) => rpc<string>('create_league', { p_name: name });
export const joinLeague = (code: string) => rpc<string>('join_league', { p_code: code });
export const leaveLeague = (leagueId: string) => rpc('leave_league', { p_league: leagueId });
export const deleteLeague = (leagueId: string) => rpc('delete_league', { p_league: leagueId });
export const resetLeague = (leagueId: string) => rpc('reset_league', { p_league: leagueId });
export const setMemberRole = (leagueId: string, userId: string, role: 'member' | 'coadmin') =>
  rpc('set_member_role', { p_league: leagueId, p_user: userId, p_role: role });
export const removeMember = (leagueId: string, userId: string) => rpc('remove_member', { p_league: leagueId, p_user: userId });

export const addProfessors = (leagueId: string, profs: { name: string; subject: string; cost: number }[]) =>
  rpc<number>('add_professors', { p_league: leagueId, p_profs: profs });
export const deleteProfessor = (id: string) => rpc('delete_professor', { p_prof: id });

export const createTeam = (leagueId: string, name: string, profIds: string[]) =>
  rpc<string>('create_team', { p_league: leagueId, p_name: name, p_prof_ids: profIds });
export const renameTeam = (teamId: string, name: string) => rpc('rename_team', { p_team: teamId, p_name: name });
export const setCaptain = (teamId: string, profId: string | null) => rpc('set_captain', { p_team: teamId, p_prof: profId });
export const setTeamFx = (teamId: string, fx: string | null) => rpc('set_team_fx', { p_team: teamId, p_fx: fx });

export const addEvents = (leagueId: string, events: { professor_id: string; event_key: string }[]) =>
  rpc<number>('add_events', { p_league: leagueId, p_events: events });
export const deleteEvent = (id: string) => rpc('delete_event', { p_event: id });
export const addCustomEvent = (leagueId: string, kind: 'bonus' | 'malus', label: string, pts: number) =>
  rpc('add_custom_event', { p_league: leagueId, p_kind: kind, p_label: label, p_pts: pts });
export const removeCatalogEvent = (leagueId: string, key: string) => rpc('remove_catalog_event', { p_league: leagueId, p_key: key });

export const proposeTrade = (leagueId: string, toUser: string, fromProf: string, toProf: string) =>
  rpc<string>('propose_trade', { p_league: leagueId, p_to_user: toUser, p_from_prof: fromProf, p_to_prof: toProf });
export const respondTrade = (tradeId: string, accept: boolean) => rpc<string>('respond_trade', { p_trade: tradeId, p_accept: accept });
export const cancelTrade = (tradeId: string) => rpc('cancel_trade', { p_trade: tradeId });

export const sendMessage = (leagueId: string, body: string) => rpc<string>('send_message', { p_league: leagueId, p_body: body });
export const deleteMessage = (id: string) => rpc('delete_message', { p_msg: id });

export const createListing = (leagueId: string, profId: string, type: 'direct' | 'auction', amount: number) =>
  rpc<string>('create_listing', { p_league: leagueId, p_prof: profId, p_type: type, p_amount: amount });
export const reclaimListing = (id: string, drop?: string | null) => rpc('reclaim_listing', { p_listing: id, p_drop: drop ?? null });
export const buyListing = (id: string, drop?: string | null) => rpc('buy_listing', { p_listing: id, p_drop: drop ?? null });
export const placeBid = (id: string, amount: number) => rpc('place_bid', { p_listing: id, p_amount: amount });
export const claimAuction = (id: string, drop?: string | null) => rpc('claim_auction', { p_listing: id, p_drop: drop ?? null });
export const buyRotating = (id: string, drop?: string | null) => rpc('buy_rotating', { p_slot: id, p_drop: drop ?? null });
export const buyItem = (leagueId: string, item: 'shield' | 'multiplier' | 'joker', drop?: string | null) =>
  rpc<string>('buy_item', { p_league: leagueId, p_item: item, p_drop: drop ?? null });

export const claimMission = (missionId: string, note = '') => rpc<string>('claim_mission', { p_mission: missionId, p_note: note });
export const reviewClaim = (claimId: string, approve: boolean) => rpc('review_claim', { p_claim: claimId, p_approve: approve });
export const addMission = (leagueId: string, label: string, desc: string, pts: number) =>
  rpc<string>('add_mission', { p_league: leagueId, p_label: label, p_desc: desc, p_reward_pts: pts });
export const deleteMission = (id: string) => rpc('delete_mission', { p_mission: id });
export const setMissionsEnabled = (leagueId: string, enabled: boolean) => rpc('set_missions_enabled', { p_league: leagueId, p_enabled: enabled });

export const makeForecast = (leagueId: string, profId: string) => rpc('make_forecast', { p_league: leagueId, p_prof: profId });
export const redeemCode = (code: string) => rpc<string>('redeem_code', { p_code: code });
export const updateProfile = (avatar: string, bio: string) => rpc('update_profile', { p_avatar: avatar, p_bio: bio });
export const setAvatarUrl = (path: string | null) => rpc('set_avatar_url', { p_url: path });

// ── SuperAdmin ───────────────────────────────────────────────────
export const adminListCodes = () => rpc<PremiumCode[]>('admin_list_codes');
export const adminCreateCode = (type: string, meta: Record<string, string>) => rpc<string>('admin_create_code', { p_type: type, p_meta: meta });
export const adminSetBan = (userId: string, until: string | null) => rpc('admin_set_ban', { p_user: userId, p_until: until });
export const adminSetLeagueSuspended = (leagueId: string, suspended: boolean) =>
  rpc('admin_set_league_suspended', { p_league: leagueId, p_suspended: suspended });
export const adminResetHof = () => rpc('admin_reset_hof');
export const adminListProfiles = () => rows<Profile>(supabase.from('profiles').select('*').order('created_at', { ascending: false }));
export const adminListTrades = () =>
  rows<Trade>(supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(100));

export const saveAnnouncement = async (a: Partial<Announcement> & { title: string; body: string }) => {
  const { error } = a.id
    ? await supabase.from('announcements').update({ title: a.title, body: a.body, tag: a.tag ?? '', pinned: a.pinned ?? false }).eq('id', a.id)
    : await supabase.from('announcements').insert({ title: a.title, body: a.body, tag: a.tag ?? '', pinned: a.pinned ?? false });
  if (error) throw error;
};
export const deleteAnnouncement = async (id: string) => {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
};
export const setAppMode = async (mode: 'normal' | 'estate' | 'maintenance') => {
  const { error } = await supabase.from('settings').upsert({ key: 'app_mode', value: mode });
  if (error) throw error;
};

/** Numero di professori e crediti spesi per ciascuna delle squadre indicate. */
export async function teamSpending(teamIds: string[]): Promise<Record<string, { count: number; spent: number }>> {
  if (!teamIds.length) return {};
  const data = await rows<{ team_id: string; professors: { cost: number } | null }>(
    supabase.from('team_professors').select('team_id, professors(cost)').in('team_id', teamIds));
  const out: Record<string, { count: number; spent: number }> = {};
  for (const r of data) {
    const o = (out[r.team_id] ??= { count: 0, spent: 0 });
    o.count += 1; o.spent += r.professors?.cost ?? 0;
  }
  return out;
}

export async function pendingTradesForMe(userId: string) {
  const { data, error } = await supabase.from('trades').select('league_id').eq('to_user', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString());
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const t of data ?? []) out[t.league_id as string] = (out[t.league_id as string] ?? 0) + 1;
  return out;
}
