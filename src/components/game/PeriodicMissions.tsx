import { ActionButton, Empty, ErrorState, Loading } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { claimPeriodicMission, periodicMissions } from '@/lib/api.game';
import { timeLeft } from '@/lib/format';
import { progressPct } from '@/lib/game';
import type { PeriodicMission } from '@/lib/types.game';

function Row({ m, leagueId, onClaim }: { m: PeriodicMission; leagueId: string; onClaim: () => Promise<void> }) {
  const done = m.progress >= m.target;
  return (
    <div className="card row">
      <span className="grow" style={{ minWidth: 0 }}>
        <b>{m.label}</b>
        <div className="muted small">{m.description}</div>
        <div className="mission-bar" role="progressbar" aria-valuenow={m.progress} aria-valuemin={0} aria-valuemax={m.target} aria-label={`Avanzamento: ${m.label}`}>
          <i style={{ width: `${progressPct(m.progress, m.target)}%` }} />
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>{m.progress}/{m.target} · <b>+{m.reward} pt</b> · {timeLeft(m.ends_at)} alla scadenza</div>
      </span>
      {m.claimed ? <span className="badge badge-pos">Riscossa</span>
        : <ActionButton size="sm" variant={done ? 'primary' : 'default'} disabled={!done} okMessage={`+${m.reward} punti!`} onAction={async () => { await claimPeriodicMission(leagueId, m.key); await onClaim(); }}>Riscuoti</ActionButton>}
    </div>
  );
}

export function PeriodicMissions({ leagueId, onClaimed }: { leagueId: string; onClaimed: () => Promise<void> }) {
  const { data, error, loading, reload } = useAsync(() => periodicMissions(leagueId), [leagueId], { interval: 60_000 });
  const refresh = async () => { await Promise.all([reload(), onClaimed()]); };
  const section = (title: string, period: PeriodicMission['period']) => {
    const list = (data ?? []).filter(m => m.period === period);
    if (!list.length) return null;
    return (
      <>
        <div className="section-title" style={{ marginTop: 0 }}><h2>{title}</h2><span className="muted small">cambiano a rotazione</span></div>
        <div className="stack" style={{ marginBottom: 14 }}>{list.map(m => <Row key={m.key} m={m} leagueId={leagueId} onClaim={refresh} />)}</div>
      </>
    );
  };
  return (
    <>
      {loading && !data && <Loading rows={2} />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !data.length && <Empty title="Nessuna missione a rotazione">Compaiono quando le missioni sono attive in questa lega.</Empty>}
      {section('Oggi', 'daily')}
      {section('Questa settimana', 'weekly')}
    </>
  );
}
