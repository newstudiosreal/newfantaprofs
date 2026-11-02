import { useMemo, useState } from 'react';
import { Button, Empty, ErrorState, Loading, Pts } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { listSeasonResults } from '@/lib/api.account';
import type { SeasonResult } from '@/lib/types.account';
import { seasonInfo } from '@/lib/season';
import { useLeague } from './context';

const MEDAL = ['🥇', '🥈', '🥉'];

function SeasonCard({ num, rows, meId }: { num: number; rows: SeasonResult[]; meId: string }) {
  const [open, setOpen] = useState(false);
  const podium = rows.slice(0, 3);
  return (
    <article className="card stack">
      <div className="row between"><h3>Stagione {num}</h3><span className="muted small">{rows.length} squadre</span></div>
      <div className="stack">
        {podium.map((r, i) => (
          <div key={r.id} className={`ledger-row ${r.owner_id === meId ? 'me' : ''}`}
            style={i === 0 ? { outline: '2px solid var(--accent)', borderRadius: 10 } : undefined}>
            <span className={`rank r${i + 1}`} aria-label={`Posizione ${i + 1}`}>{MEDAL[i]}</span>
            <span style={{ minWidth: 0 }}>
              <b className="ellipsis" style={{ display: 'block' }}>{i === 0 && '👑 '}{r.team_name}</b>
              <span className="muted tiny ellipsis" style={{ display: 'block' }}>
                {r.username || '?'} · {r.professors.map(p => (p.captain ? '★ ' : '') + p.name.split(' ').slice(-1)[0]).join(', ') || '—'}
              </span>
            </span>
            <span className="score">{r.score}<small>PUNTI</small></span>
          </div>
        ))}
      </div>
      {rows.length > 3 && (
        <>
          <Button size="sm" variant="ghost" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Nascondi classifica' : 'Classifica completa'}</Button>
          {open && rows.slice(3).map(r => (
            <div key={r.id} className={`row between ${r.owner_id === meId ? 'bold' : ''}`} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span><span className="muted">{r.rank}.</span> {r.team_name} <span className="muted tiny">· {r.username}</span></span>
              <Pts value={r.score} />
            </div>
          ))}
        </>
      )}
    </article>
  );
}

export function Seasons() {
  const { bundle, meId, ranking } = useLeague();
  const { league } = bundle;
  const { data, error, loading, reload } = useAsync(() => listSeasonResults(league.id), [league.id, league.season_num]);
  const info = seasonInfo(league.season_start, league.season_num);
  const bySeason = useMemo(() => {
    const m = new Map<number, SeasonResult[]>();
    (data ?? []).forEach(r => m.set(r.season_num, [...(m.get(r.season_num) ?? []), r]));
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [data]);
  const leader = ranking[0];

  return (
    <>
      <div className="card">
        <div className="row between row-wrap">
          <div>
            <p className="muted small" style={{ margin: 0 }}>Stagione corrente</p>
            <h2 style={{ fontSize: '2.2rem' }}>Stagione {info.num}</h2>
          </div>
          <span className="badge">{info.state === 'active' ? `${info.left} giorni alla fine` : info.state === 'pause' ? `Pausa · via tra ${info.left}g` : 'Finita: in attesa di chiusura'}</span>
        </div>
        {info.state === 'active' && leader && leader.score !== 0 && <p className="muted small" style={{ marginBottom: 0 }}>In testa: <b>{leader.name}</b> con {leader.score} punti.</p>}
        <p className="hint">{league.auto_season_end ? 'A fine stagione la lega si chiude da sola.' : "A fine stagione la chiude un admin dalle impostazioni."} Dopo la chiusura la classifica viene archiviata qui e le squadre ripartono da zero (nome ed effetti restano).</p>
      </div>

      <div className="section-title"><h2>Stagioni concluse</h2></div>
      {loading && !data && <Loading rows={2} />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !bySeason.length && <Empty title="Nessuna stagione conclusa">Il podio di ogni stagione comparirà qui.</Empty>}
      <div className="stack">{bySeason.map(([num, rows]) => <SeasonCard key={num} num={num} rows={rows} meId={meId} />)}</div>
    </>
  );
}
