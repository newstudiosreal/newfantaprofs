import { chartTeams, cumulativeSeries, dayRange, linePath } from '@/lib/game';
import type { TimelinePoint } from '@/lib/types.game';

const COLORS = ['#7fb2ff', '#ff9f5c', '#c58bff', '#6be3a6', '#ff6a8f', '#58d6d6'];
const W = 640; const H = 230; const PX = 38; const PY = 14;

/** Andamento cumulativo dei punti: prime 5 squadre + la mia (SVG a mano, con tabella alternativa per screen reader). */
export function PointsChart({ points, names, meTeamId }: { points: TimelinePoint[]; names: Record<string, string>; meTeamId?: string }) {
  if (!points.length) return <p className="muted small">Il grafico compare dopo i primi eventi della stagione.</p>;
  const days = dayRange(points.reduce((m, p) => (p.day < m ? p.day : m), points[0].day), points.reduce((m, p) => (p.day > m ? p.day : m), points[0].day));
  const ids = chartTeams(points, meTeamId);
  const series = cumulativeSeries(points, days, ids);
  const all = series.flatMap(s => s.values);
  const min = Math.min(0, ...all); const max = Math.max(1, ...all);
  const colorOf = (id: string, i: number) => (id === meTeamId ? 'var(--accent)' : COLORS[i % COLORS.length]);
  const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Andamento dei punti per ${series.length} squadre dal ${fmtDay(days[0])} al ${fmtDay(days[days.length - 1])}`}>
        <line className="axis" x1={PX} x2={W - 8} y1={H - PY} y2={H - PY} />
        <line className="axis" x1={PX} x2={PX} y1={PY} y2={H - PY} />
        <text className="lbl" x={PX - 4} y={PY + 4} textAnchor="end">{max}</text>
        <text className="lbl" x={PX - 4} y={H - PY} textAnchor="end">{min}</text>
        <text className="lbl" x={PX} y={H - 1} textAnchor="start">{fmtDay(days[0])}</text>
        <text className="lbl" x={W - 8} y={H - 1} textAnchor="end">{fmtDay(days[days.length - 1])}</text>
        <g transform={`translate(${PX} 0)`}>
          {series.map((s, i) => (
            <path key={s.team_id} className={`line ${s.team_id === meTeamId ? 'me' : ''}`} stroke={colorOf(s.team_id, i)}
              d={linePath(s.values, W - PX - 8, H, min, max, PY)} />
          ))}
        </g>
      </svg>
      <div className="legend">
        {series.map((s, i) => (
          <span key={s.team_id}><i style={{ borderColor: colorOf(s.team_id, i) }} />{names[s.team_id] ?? '?'}{s.team_id === meTeamId ? ' (tu)' : ''} <b>{s.values[s.values.length - 1]}</b></span>
        ))}
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className="small muted">Vedi i dati in tabella</summary>
        <div style={{ overflowX: 'auto' }}>
          <table className="table-sm">
            <thead><tr><th>Squadra</th>{days.slice(-7).map(d => <th key={d} className="num">{fmtDay(d)}</th>)}</tr></thead>
            <tbody>{series.map(s => <tr key={s.team_id}><td>{names[s.team_id] ?? '?'}</td>{s.values.slice(-7).map((v, i) => <td key={i} className="num">{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}
