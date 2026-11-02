import { useState } from 'react';
import { ActionButton, Empty, ErrorState, Loading, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { listForecasts, makeForecast } from '@/lib/api';
import { listTeamForecasts, makeTeamForecast } from '@/lib/api.game';
import { forecastStreak, teamForecastWins, weekStartKey } from '@/lib/game';
import { useLeague } from './context';

const weekLabel = (w: string) => new Date(`${w}T00:00:00Z`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', timeZone: 'UTC' });

export function Forecast() {
  const { bundle, myTeam, teamProfs, profById, meId, reload: reloadLeague } = useLeague();
  const { league, teams } = bundle;
  const { data, error, loading, reload } = useAsync(() => listForecasts(league.id), [league.id]);
  const teamFc = useAsync(() => listTeamForecasts(league.id, meId), [league.id, meId], { enabled: !!myTeam });
  const [pick, setPick] = useState('');
  const mine = (data ?? []).filter(f => f.user_id === meId);
  const week = weekStartKey();
  const thisWeek = mine.find(f => f.week_start === week);
  const thisTeamWeek = (teamFc.data ?? []).find(f => f.week_start === week);
  const streak = forecastStreak(mine);
  const teamName = (id: string) => teams.find(t => t.id === id)?.name ?? '?';
  const refresh = async () => { await Promise.all([reload(), teamFc.reload(), reloadLeague()]); };

  if (!myTeam) return <Empty title="Serve una squadra">Crea la tua squadra per fare pronostici.</Empty>;

  return (
    <>
      <div className="card row between">
        <span><b>Serie di pronostici giusti</b><div className="muted small">Dalla 3ª vittoria di fila: +20 pt a ogni pronostico giusto.</div></span>
        <span className="score">{streak}<small>DI FILA</small></span>
      </div>

      <div className="section-title"><h2>Il tuo prof</h2></div>
      <div className="card">
        <h3>Chi farà più punti questa settimana?</h3>
        <p className="muted small">Scegli uno dei tuoi professori. Se a fine settimana è tra i migliori della tua squadra con punti positivi, ricevi <b>+60 pt</b>. Un pronostico a settimana, non modificabile.</p>
        {loading && !data && <Loading rows={1} />}
        {error != null && <ErrorState error={error} onRetry={reload} />}
        {data && thisWeek && <p className="badge badge-accent">Il tuo pronostico: {profById(thisWeek.professor_id)?.name ?? '?'}</p>}
        {data && !thisWeek && (
          <div className="grid grid-2">{teamProfs(myTeam.id).map(p => (
            <ActionButton key={p.id} okMessage={`Pronostico registrato: ${p.name}`} onAction={async () => { await makeForecast(league.id, p.id); await refresh(); }}>{p.name}</ActionButton>
          ))}</div>
        )}
        {data && !thisWeek && !teamProfs(myTeam.id).length && <p className="muted small">La tua squadra è vuota.</p>}
      </div>

      <div className="section-title"><h2>La squadra</h2></div>
      <div className="card">
        <h3>Quale squadra guadagnerà più punti?</h3>
        <p className="muted small">Scegli la squadra della lega (anche la tua) che farà più punti da lunedì a domenica: se ci prendi, <b>+40 pt</b>. Contano bonus, malus e premi.</p>
        {thisTeamWeek ? <p className="badge badge-accent">Il tuo pronostico: {teamName(thisTeamWeek.team_id)}</p> : (
          <div className="row">
            <Select value={pick} onChange={setPick} aria-label="Squadra pronosticata"><option value="">Scegli una squadra</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            <ActionButton variant="primary" disabled={!pick} okMessage="Pronostico di squadra registrato" onAction={async () => { await makeTeamForecast(league.id, pick); setPick(''); await refresh(); }}>Conferma</ActionButton>
          </div>
        )}
        {teamFc.data && teamForecastWins(teamFc.data) > 0 && <p className="hint">Pronostici di squadra azzeccati: {teamForecastWins(teamFc.data)}</p>}
      </div>

      <div className="section-title"><h2>Storico</h2></div>
      {data && !mine.length && !(teamFc.data?.length) && <Empty title="Nessun pronostico">Il primo lo fai qui sopra.</Empty>}
      <div className="card" style={mine.length || teamFc.data?.length ? undefined : { display: 'none' }}>
        {mine.map(f => (
          <div key={`p${f.week_start}`} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span>Sett. del {weekLabel(f.week_start)} · 🎓 <b>{profById(f.professor_id)?.name ?? '?'}</b></span>
            <span className={`badge ${f.won ? 'badge-pos' : ''}`}>{!f.resolved ? 'In corso' : f.won ? 'Giusto ✓' : 'Sbagliato'}</span>
          </div>
        ))}
        {(teamFc.data ?? []).map(f => (
          <div key={`t${f.week_start}`} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span>Sett. del {weekLabel(f.week_start)} · 👥 <b>{teamName(f.team_id)}</b></span>
            <span className={`badge ${f.won ? 'badge-pos' : ''}`}>{!f.resolved ? 'In corso' : f.won ? 'Giusto ✓' : 'Sbagliato'}</span>
          </div>
        ))}
      </div>
    </>
  );
}
