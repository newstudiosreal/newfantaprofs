import { ActionButton, Empty, ErrorState, Loading } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { listForecasts, makeForecast } from '@/lib/api';
import { useLeague } from './context';

/** Lunedì della settimana corrente (fuso Europe/Rome), come la funzione SQL. */
function weekStart(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = fmt.format(new Date()).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dow);
  return date.toISOString().slice(0, 10);
}

export function Forecast() {
  const { bundle, myTeam, teamProfs, profById, meId, reload: reloadLeague } = useLeague();
  const { league } = bundle;
  const { data, error, loading, reload } = useAsync(() => listForecasts(league.id), [league.id]);
  const mine = (data ?? []).filter(f => f.user_id === meId);
  const thisWeek = mine.find(f => f.week_start === weekStart());

  if (!myTeam) return <Empty title="Serve una squadra">Crea la tua squadra per fare pronostici.</Empty>;

  return (
    <>
      <div className="card">
        <h3>Chi farà più punti questa settimana?</h3>
        <p className="muted small">Scegli uno dei tuoi professori. Se a fine settimana è tra i migliori della tua squadra con punti positivi, ricevi <b>+60 pt</b>. Un pronostico a settimana, non modificabile.</p>
        {loading && !data && <Loading rows={1} />}
        {error != null && <ErrorState error={error} onRetry={reload} />}
        {data && thisWeek && <p className="badge badge-accent">Il tuo pronostico: {profById(thisWeek.professor_id)?.name ?? '?'}</p>}
        {data && !thisWeek && (
          <div className="grid grid-2">{teamProfs(myTeam.id).map(p => (
            <ActionButton key={p.id} okMessage={`Pronostico registrato: ${p.name}`} onAction={async () => { await makeForecast(league.id, p.id); await Promise.all([reload(), reloadLeague()]); }}>{p.name}</ActionButton>
          ))}</div>
        )}
        {data && !thisWeek && !teamProfs(myTeam.id).length && <p className="muted small">La tua squadra è vuota.</p>}
      </div>

      <div className="section-title"><h2>I tuoi pronostici</h2></div>
      {data && !mine.length && <Empty title="Nessun pronostico">Il primo lo fai qui sopra.</Empty>}
      <div className="card" style={mine.length ? undefined : { display: 'none' }}>
        {mine.map(f => (
          <div key={f.week_start} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span>Settimana del {new Date(f.week_start).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} · <b>{profById(f.professor_id)?.name ?? '?'}</b></span>
            <span className="badge">{f.resolved ? 'Chiuso' : 'In corso'}</span>
          </div>
        ))}
      </div>
    </>
  );
}
