import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PointsChart } from '@/components/game/PointsChart';
import { Empty, ErrorState, Loading, Pts, TeamName } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { listEvents } from '@/lib/api';
import { leagueTimeline, listEventsSince, teamScoresBetween } from '@/lib/api.game';
import { timeAgo } from '@/lib/format';
import { deltaLabel, periodStart, rankDeltas, romeWeekStart, topProfessor, type Period } from '@/lib/game';
import type { PeriodScore } from '@/lib/types.game';
import { useLeague } from './context';

const PERIODS: { id: Period; label: string }[] = [{ id: 'today', label: 'Oggi' }, { id: 'week', label: 'Settimana' }, { id: 'season', label: 'Stagione' }];

export function Standings() {
  const { bundle, ranking, meId, myTeam, teamProfs, userById, profById, isAdmin } = useLeague();
  const { league, teams } = bundle;
  const [period, setPeriod] = useState<Period>('season');
  const events = useAsync(() => listEvents(league.id, 30), [league.id], { interval: 30_000 });
  const scores = useAsync(() => teamScoresBetween(league.id, periodStart(period)), [league.id, period, ranking], { interval: 30_000 });
  const prev = useAsync(() => teamScoresBetween(league.id, null, new Date(Date.now() - 86_400_000)), [league.id, ranking], { interval: 120_000 });
  const timeline = useAsync(() => leagueTimeline(league.id), [league.id, ranking], { interval: 120_000 });
  const weekEvents = useAsync(() => listEventsSince(league.id, romeWeekStart()), [league.id, ranking], { interval: 120_000 });

  // Classifica mostrata: periodo scelto; per "Stagione" ripiego sui dati già caricati con la lega.
  const rows: PeriodScore[] = useMemo(() => scores.data
    ?? (period === 'season' ? ranking.map(r => ({ team_id: r.team_id, owner_id: r.owner_id, name: r.name, captain_id: r.captain_id, score: r.score })) : []),
  [scores.data, period, ranking]);
  const deltas = useMemo(() => (period === 'season' && prev.data ? rankDeltas(prev.data, rows) : {}), [period, prev.data, rows]);
  const names = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t.name])), [teams]);
  const top = useMemo(() => topProfessor(weekEvents.data ?? []), [weekEvents.data]);
  const topProf = top ? profById(top.professor_id) : undefined;

  return (
    <>
      {topProf && top && (
        <div className="feature" role="note">
          <span className="emoji" aria-hidden="true">🌟</span>
          <span className="grow"><b>Prof della settimana</b><div className="muted small">{topProf.name}{topProf.subject ? ` · ${topProf.subject}` : ''}</div></span>
          <span className="pts pos">+{top.pts}</span>
        </div>
      )}

      <div className="section-title" style={{ marginTop: 0 }}>
        <h2>Classifica</h2>
        <div className="seg" role="group" aria-label="Periodo">
          {PERIODS.map(p => <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
        </div>
      </div>
      {scores.error != null && <ErrorState error={scores.error} onRetry={scores.reload} />}
      {!ranking.length ? (
        <Empty title="Nessuna squadra">
          <p>Sii il primo: scegli i tuoi professori.</p>
          <Link to="squadra" className="btn btn-primary">Crea la tua squadra</Link>
        </Empty>
      ) : (
        <div className="ledger">
          {scores.loading && !scores.data && period !== 'season' && <div style={{ padding: 14 }}><Loading rows={2} /></div>}
          {rows.map((s, i) => {
            const team = teams.find(t => t.id === s.team_id);
            const owner = userById(s.owner_id);
            const profs = teamProfs(s.team_id);
            const d = deltas[s.team_id] ?? 0;
            return (
              <Link key={s.team_id} to={`/profilo/${owner?.username ?? ''}`} className={`ledger-row ${s.owner_id === meId ? 'me' : ''}`}>
                <span className="rank-cell">
                  <span className={`rank ${i < 3 ? `r${i + 1}` : ''}`}>{i + 1}</span>
                  {period === 'season' && prev.data && <span className={`delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`} aria-label={d > 0 ? `salita di ${d}` : d < 0 ? `scesa di ${-d}` : 'invariata'}>{deltaLabel(d)}</span>}
                </span>
                <span style={{ minWidth: 0 }}>
                  <b className="ellipsis" style={{ display: 'block' }}><TeamName name={s.name} fx={team?.name_fx} /></b>
                  <span className="muted tiny ellipsis" style={{ display: 'block' }}>
                    {owner?.username ?? '?'} · {profs.map(p => (p.id === s.captain_id ? '★ ' : '') + p.name.split(' ').slice(-1)[0]).join(', ') || 'nessun prof'}
                  </span>
                </span>
                <span className="score">{s.score}<small>PUNTI</small></span>
              </Link>
            );
          })}
        </div>
      )}
      {period === 'season' && <p className="hint">Le frecce confrontano la posizione di adesso con quella di 24 ore fa.</p>}

      <div className="section-title"><h2>Andamento punti</h2></div>
      <div className="card">
        {timeline.loading && !timeline.data && <Loading rows={2} />}
        {timeline.error != null && <ErrorState error={timeline.error} onRetry={timeline.reload} />}
        {timeline.data && <PointsChart points={timeline.data} names={names} meTeamId={myTeam?.id} />}
      </div>

      <div className="section-title"><h2>Ultimi eventi</h2></div>
      {events.loading && !events.data && <Loading rows={3} />}
      {events.error != null && <ErrorState error={events.error} onRetry={events.reload} />}
      {events.data && !events.data.length && (
        <Empty title="Ancora nulla in registro">{isAdmin ? 'Registra il primo evento da Gestione.' : "L'admin registrerà gli eventi delle lezioni."}</Empty>
      )}
      <div className="card" style={events.data?.length ? undefined : { display: 'none' }}>
        {events.data?.map(e => {
          const prof = e.professor_id ? profById(e.professor_id) : undefined;
          const team = e.team_id ? teams.find(t => t.id === e.team_id) : undefined;
          return (
            <div key={e.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ minWidth: 0 }}>
                <span className="ellipsis" style={{ display: 'block' }}>{e.label}</span>
                <span className="muted tiny">{prof ? prof.name : team ? `Squadra ${team.name}` : 'Sistema'} · {timeAgo(e.created_at)}</span>
              </span>
              <Pts value={e.pts} />
            </div>
          );
        })}
      </div>
    </>
  );
}
