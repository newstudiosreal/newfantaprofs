import { useEffect, useMemo } from 'react';
import { NavLink, Route, Routes, useParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { loadLeagueBundle, pendingTradesForMe } from '@/lib/api';
import { applySkin, getSavedSkin } from '@/lib/premium';
import { supabase } from '@/lib/supabase';
import { seasonInfo } from '@/lib/season';
import { LeagueContext, type LeagueCtx } from './context';
import { Standings } from './Standings';
import { MyTeam } from './MyTeam';
import { Professors } from './Professors';
import { Market } from './Market';
import { Trades } from './Trades';
import { Missions } from './Missions';
import { Forecast } from './Forecast';
import { Chat, chatSeenKey } from './Chat';
import { Admin } from './Admin';
import { ProPage } from './ProPage';

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
  const { leagueId = '' } = useParams();
  const { profile } = useAuth();
  const me = profile!;
  const { data: bundle, error, loading, reload } = useAsync(() => loadLeagueBundle(leagueId), [leagueId], { interval: 30_000 });
  const badges = useAsync(() => loadBadges(leagueId, me.id), [leagueId, me.id], { interval: 45_000 });

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
  const season = seasonInfo(league.season_start);
  const tabs: { to: string; label: string; end?: boolean; n?: number; show?: boolean }[] = [
    { to: '', label: 'Classifica', end: true },
    { to: 'squadra', label: 'Squadra' },
    { to: 'professori', label: 'Professori' },
    { to: 'mercato', label: 'Mercato' },
    { to: 'scambi', label: 'Scambi', n: badges.data?.trades },
    { to: 'missioni', label: 'Missioni', show: league.missions_enabled },
    { to: 'pronostici', label: 'Pronostici' },
    { to: 'chat', label: 'Chat', n: badges.data?.chat },
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
              {season.active ? `Stagione ${season.num} · ${season.left} giorni alla fine` : `Pausa tra stagioni · ${season.left} giorni al via`}
              {league.suspended && ' · LEGA SOSPESA'}
            </p>
          </div>
          <button className="btn btn-sm" title="Copia il codice lega" onClick={() => { void navigator.clipboard?.writeText(league.code); }}>
            Codice <b className="code">{league.code}</b>
          </button>
        </div>
        <Routes>
          <Route index element={<Standings />} />
          <Route path="squadra" element={<MyTeam />} />
          <Route path="professori" element={<Professors />} />
          <Route path="mercato" element={<Market />} />
          <Route path="scambi" element={<Trades />} />
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
