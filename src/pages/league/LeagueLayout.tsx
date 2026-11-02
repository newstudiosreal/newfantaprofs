import { useEffect, useMemo } from 'react';
import { NavLink, Route, Routes, useParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { loadLeagueBundle, pendingTradesForMe } from '@/lib/api';
import { applySkin, getSavedSkin } from '@/lib/premium';
import { supabase } from '@/lib/supabase';
import { seasonInfo } from '@/lib/season';
import type { Profile } from '@/lib/types';
import { LeagueContext, type LeagueCtx } from './context';
import { Standings } from './Standings';
import { MyTeam } from './MyTeam';
import { Professors } from './Professors';
import ProfessorDetail from './ProfessorDetail';
import { Market } from './Market';
import { Trades } from './Trades';
import { Missions } from './Missions';
import { Forecast } from './Forecast';
import { Chat, chatSeenKey } from './Chat';
import { Admin } from './Admin';
import { ProPage } from './ProPage';
import { Duels } from './Duels';
import { Proposals } from './Proposals';
import { Seasons } from './Seasons';

async function loadBadges(leagueId: string, userId: string) {
  let seen = 0;
  try { seen = Number(localStorage.getItem(chatSeenKey(leagueId)) ?? 0); } catch { /* ignora */ }
  const [trades, chat] = await Promise.all([
    pendingTradesForMe(userId),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('league_id', leagueId)
      .neq('author_id', userId).gt('created_at', new Date(seen).toISOString()),
  ]);
  return { trades: trades[leagueId] ?? 0, chat: chat.count ?? 0 };
}

export default function LeagueLayout() {
  const { profile } = useAuth();
  if (!profile) return <main className="page"><Loading /></main>;
  return <LeagueLayoutInner me={profile} />;
}

function LeagueLayoutInner({ me }: { me: Profile }) {
  const { leagueId = '' } = useParams();
  // Il polling lento è solo una rete di sicurezza: gli aggiornamenti arrivano in tempo reale.
  const { data: bundle, error, loading, reload } = useAsync(() => loadLeagueBundle(leagueId), [leagueId], { interval: 120_000 });
  const badges = useAsync(() => loadBadges(leagueId, me.id), [leagueId, me.id], { interval: 120_000 });
  const lf = `league_id=eq.${leagueId}`;
  useRealtime(
    [{ table: 'events', filter: lf }, { table: 'teams', filter: lf }, 'team_professors', { table: 'trades', filter: lf },
      { table: 'market_listings', filter: lf }, { table: 'duels', filter: lf }, { table: 'league_members', filter: lf }, { table: 'leagues', filter: `id=eq.${leagueId}` }],
    { onChange: () => { void reload(); void badges.reload(); }, debounceMs: 700 },
  );
  useRealtime([{ table: 'messages', filter: lf }], { onChange: () => { void badges.reload(); }, debounceMs: 700 });

  // Skin scelta (solo per me): applicata mentre sono in lega.
  useEffect(() => {
    applySkin(getSavedSkin(leagueId));
    return () => applySkin('default');
  }, [leagueId]);

  const ctx = useMemo<LeagueCtx | null>(() => {
    if (!bundle) return null;
    const { league, members, professors, teams, teamProfessors, profiles, scores } = bundle;
    const myMember = members.find(m => m.user_id === me.id);
    const isSuper = me.is_superadmin;
    const isOwner = league.owner_id === me.id || isSuper;
    const isAdmin = isOwner || myMember?.role === 'coadmin';
    const myTeam = teams.find(t => t.owner_id === me.id);
    const profMap = new Map(professors.map(p => [p.id, p]));
    return {
      bundle, reload, meId: me.id, isSuper, isAdmin, isOwner, myTeam,
      can: perm => isOwner || (isAdmin && (league.coadmin_perms?.[perm] ?? (perm !== 'members'))),
      myScore: scores.find(s => s.owner_id === me.id)?.score ?? 0,
      profById: id => profMap.get(id),
      userById: id => profiles[id],
      teamProfs: teamId => teamProfessors.filter(tp => tp.team_id === teamId).map(tp => profMap.get(tp.professor_id)).filter((p): p is NonNullable<typeof p> => !!p),
      ranking: scores,
    };
  }, [bundle, me.id, me.is_superadmin, reload]);

  if (loading && !bundle) return <main className="page"><Loading /></main>;
  if (error != null && !bundle) return <main className="page"><ErrorState error={error} onRetry={reload} /></main>;
  if (!ctx) return null;

  const { league } = ctx.bundle;
  const season = seasonInfo(league.season_start, league.season_num);
  const emptyTeam = !!ctx.myTeam && ctx.teamProfs(ctx.myTeam.id).length === 0;
  const tabs: { to: string; label: string; end?: boolean; n?: number; show?: boolean }[] = [
    { to: '', label: 'Classifica', end: true },
    { to: 'squadra', label: 'Squadra' },
    { to: 'professori', label: 'Professori' },
    { to: 'mercato', label: 'Mercato' },
    { to: 'scambi', label: 'Scambi', n: badges.data?.trades },
    { to: 'sfide', label: 'Sfide' },
    { to: 'missioni', label: 'Missioni', show: league.missions_enabled },
    { to: 'pronostici', label: 'Pronostici' },
    { to: 'proposte', label: 'Proposte' },
    { to: 'chat', label: 'Chat', n: badges.data?.chat },
    { to: 'stagioni', label: 'Stagioni' },
    { to: 'pro', label: '⚡ Pro', show: ctx.bundle.proOwner },
    { to: 'gestione', label: 'Gestione', show: ctx.isAdmin },
  ];

  return (
    <LeagueContext.Provider value={ctx}>
      <div className="tabs" role="tablist" aria-label={`Sezioni di ${league.name}`}>
        {tabs.filter(t => t.show !== false).map(t => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {t.label}{t.n ? <span className="dot">{t.n > 9 ? '9+' : t.n}</span> : null}
          </NavLink>
        ))}
      </div>
      <main className="page">
        <div className="row between row-wrap" style={{ marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(2rem, 7vw, 3rem)' }} className="ellipsis">{league.name}</h1>
            <p className="muted small" style={{ margin: 0 }}>
              {season.state === 'active' ? `Stagione ${season.num} · ${season.left} giorni alla fine`
                : season.state === 'pause' ? `Pausa tra stagioni · ${season.left} giorni al via della stagione ${season.num}`
                : `Stagione ${season.num} finita`}
              {league.suspended && ' · LEGA SOSPESA'}
            </p>
          </div>
          <button className="btn btn-sm" title="Copia il codice lega" onClick={() => { void navigator.clipboard?.writeText(league.code); }}>
            Codice <b className="code">{league.code}</b>
          </button>
        </div>
        {season.state === 'ended' && (
          <div className="card row row-wrap between" style={{ marginBottom: 14 }}>
            <span className="small"><b>🏁 Stagione finita.</b> {ctx.isAdmin ? 'La chiusura è manuale: chiudila per archiviare la classifica e far ripartire le squadre.' : "L'admin deve chiuderla: poi la classifica verrà archiviata e le squadre ripartiranno da zero."}</span>
            {ctx.isAdmin && <NavLink to="gestione" className="btn btn-sm btn-primary">Vai alle impostazioni</NavLink>}
          </div>
        )}
        {emptyTeam && season.state !== 'ended' && (
          <div className="card row row-wrap between" style={{ marginBottom: 14 }}>
            <span className="small"><b>🔁 {season.state === 'pause' ? 'Pausa tra stagioni' : 'Nuova stagione'}.</b> La tua squadra è senza professori: ricostruiscila con 50 crediti.</span>
            <NavLink to="squadra" className="btn btn-sm btn-primary">Ricostruisci la squadra</NavLink>
          </div>
        )}
        <Routes>
          <Route index element={<Standings />} />
          <Route path="squadra" element={<MyTeam />} />
          <Route path="professori" element={<Professors />} />
          <Route path="professori/:profId" element={<ProfessorDetail />} />
          <Route path="mercato" element={<Market />} />
          <Route path="scambi" element={<Trades />} />
          <Route path="sfide" element={<Duels />} />
          <Route path="proposte" element={<Proposals />} />
          <Route path="stagioni" element={<Seasons />} />
          <Route path="missioni" element={<Missions />} />
          <Route path="pronostici" element={<Forecast />} />
          <Route path="chat" element={<Chat />} />
          <Route path="pro" element={<ProPage />} />
          <Route path="gestione" element={ctx.isAdmin ? <Admin /> : <p className="muted">Solo gli admin della lega.</p>} />
          <Route path="*" element={<p className="muted">Sezione non trovata.</p>} />
        </Routes>
      </main>
    </LeagueContext.Provider>
  );
}
