import { Link } from 'react-router-dom';
import { Empty, ErrorState, Loading, Pts, TeamName } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { listEvents } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useLeague } from './context';

export function Standings() {
  const { bundle, ranking, meId, teamProfs, userById, profById, isAdmin } = useLeague();
  const { league, teams } = bundle;
  const events = useAsync(() => listEvents(league.id, 30), [league.id], { interval: 30_000 });

  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}><h2>Classifica</h2><span className="muted small">{ranking.length} squadre</span></div>
      {!ranking.length ? (
        <Empty title="Nessuna squadra">
          <p>Sii il primo: scegli i tuoi professori.</p>
          <Link to="squadra" className="btn btn-primary">Crea la tua squadra</Link>
        </Empty>
      ) : (
        <div className="ledger">
          {ranking.map((s, i) => {
            const team = teams.find(t => t.id === s.team_id);
            const owner = userById(s.owner_id);
            const profs = teamProfs(s.team_id);
            return (
              <Link key={s.team_id} to={`/profilo/${owner?.username ?? ''}`} className={`ledger-row ${s.owner_id === meId ? 'me' : ''}`}>
                <span className={`rank ${i < 3 ? `r${i + 1}` : ''}`}>{i + 1}</span>
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
