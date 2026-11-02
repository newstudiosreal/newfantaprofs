import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Sparkline } from '@/components/game/Sparkline';
import { WatchStar } from '@/components/game/WatchStar';
import { useWatchlist } from '@/components/game/useWatchlist';
import { Empty, ErrorState, Loading, Pts, TeamName } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { listProfessorEvents } from '@/lib/api';
import { professorSales } from '@/lib/api.game';
import { fmtDate, timeAgo } from '@/lib/format';
import { useLeague } from './context';

export default function ProfessorDetail() {
  const { profId = '' } = useParams();
  const { bundle, profById, userById, meId } = useLeague();
  const { league, teams, teamProfessors, profScores } = bundle;
  const prof = profById(profId);
  const events = useAsync(() => listProfessorEvents(profId), [profId], { interval: 60_000, enabled: !!prof });
  const sales = useAsync(() => professorSales(profId), [profId], { enabled: !!prof });
  const watch = useWatchlist(league.id, meId);

  const stats = useMemo(() => {
    const ev = events.data ?? [];
    const asc = [...ev].reverse();
    let acc = 0;
    return {
      bonus: ev.filter(e => e.pts > 0).length, malus: ev.filter(e => e.pts < 0).length,
      trend: asc.map(e => (acc += e.pts)),
    };
  }, [events.data]);
  const owners = teams.filter(t => teamProfessors.some(tp => tp.team_id === t.id && tp.professor_id === profId));

  if (!prof) return <><Link to=".." relative="path" className="small bold">← Professori</Link><Empty title="Professore non trovato">Potrebbe essere stato rimosso dalla lega.</Empty></>;
  const total = profScores[prof.id]?.pts ?? 0;

  return (
    <>
      <Link to=".." relative="path" className="small bold">← Tutti i professori</Link>
      <div className="card" style={{ marginTop: 10 }}>
        <div className="row between row-wrap">
          <div className="row" style={{ minWidth: 0 }}>
            <span className="prof-photo" aria-hidden="true">{prof.name[0]}</span>
            <span style={{ minWidth: 0 }}><h2 className="ellipsis" style={{ fontSize: '2rem' }}>{prof.name}</h2><span className="muted small">{prof.subject || 'Materia non indicata'} · {prof.cost} crediti</span></span>
          </div>
          <span className="row"><WatchStar on={watch.ids.has(prof.id)} onToggle={() => void watch.toggle(prof.id)} name={prof.name} /><div className="score">{total}<small>PUNTI</small></div></span>
        </div>
        <div className="stat-grid" style={{ marginTop: 12 }}>
          <div className="card-flat"><b>{stats.bonus}</b><span className="muted tiny">bonus</span></div>
          <div className="card-flat"><b>{stats.malus}</b><span className="muted tiny">malus</span></div>
          <div className="card-flat"><b>{owners.length}</b><span className="muted tiny">{owners.length === 1 ? 'squadra' : 'squadre'}</span></div>
        </div>
      </div>

      <div className="section-title"><h2>Andamento</h2></div>
      <div className="card">
        {events.loading && !events.data && <Loading rows={1} />}
        {events.data && <Sparkline values={stats.trend} label={`Andamento dei punti di ${prof.name}`} />}
      </div>

      <div className="section-title"><h2>Chi lo ha in squadra</h2></div>
      {!owners.length ? <Empty title="Nessuna squadra">È ancora libero: nessuno lo ha scelto.</Empty> : (
        <div className="card">{owners.map(t => (
          <div key={t.id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <b><TeamName name={t.name} fx={t.name_fx} />{t.captain_id === prof.id ? ' ★' : ''}</b><span className="muted small">{userById(t.owner_id)?.username ?? '?'}</span>
          </div>
        ))}</div>
      )}

      <div className="section-title"><h2>Storico prezzi</h2></div>
      {sales.error != null && <ErrorState error={sales.error} onRetry={sales.reload} />}
      {sales.data && !sales.data.length && <Empty title="Mai venduto">Qui compaiono le vendite sul mercato.</Empty>}
      <div className="card" style={sales.data?.length ? undefined : { display: 'none' }}>
        {sales.data?.map((s, i) => (
          <div key={i} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{s.kind === 'rotation' ? '🔄 Vetrina' : '🛒 Mercato'}{s.buyer_id ? ` · a ${userById(s.buyer_id)?.username ?? '?'}` : ''}</span>
            <span><b>{s.price} pt</b> <span className="muted tiny">{fmtDate(s.at)}</span></span>
          </div>
        ))}
      </div>

      <div className="section-title"><h2>Storico eventi</h2></div>
      {events.error != null && <ErrorState error={events.error} onRetry={events.reload} />}
      {events.data && !events.data.length && <Empty title="Nessun evento">Questo prof non ha ancora fatto punti.</Empty>}
      <div className="card" style={events.data?.length ? undefined : { display: 'none' }}>
        {events.data?.map(e => (
          <div key={e.id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ minWidth: 0 }}><span className="ellipsis" style={{ display: 'block' }}>{e.label}</span><span className="muted tiny">{timeAgo(e.created_at)}</span></span>
            <Pts value={e.pts} />
          </div>
        ))}
      </div>
    </>
  );
}
