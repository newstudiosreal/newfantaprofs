import { useMemo, useState } from 'react';
import { ActionButton, Empty, ErrorState, Field, Loading, Select, TeamName } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { cancelDuel, duelLive, listDuels, proposeDuel, respondDuel, teamScoresBetween } from '@/lib/api.game';
import { fmtDateTime, timeLeft } from '@/lib/format';
import { romeDayStart } from '@/lib/game';
import type { Duel } from '@/lib/types.game';
import { useLeague } from './context';

function VersusBar({ a, b, nameA, nameB }: { a: number; b: number; nameA: string; nameB: string }) {
  const pa = Math.max(0, Math.min(100, Math.round((Math.max(a, 0) / Math.max(1, Math.max(a, 0) + Math.max(b, 0))) * 100)));
  return (
    <div role="img" aria-label={`${nameA} ${a} punti contro ${nameB} ${b} punti`}>
      <div className="row between small"><b>{nameA}</b><b>{nameB}</b></div>
      <div className="bar2">
        <div className={`side ${a > b ? 'lead' : ''}`}><i style={{ width: `${pa}%` }} /></div>
        <span className="pts" style={{ whiteSpace: 'nowrap' }}>{a} · {b}</span>
        <div className={`side right ${b > a ? 'lead' : ''}`}><i style={{ width: `${100 - pa}%` }} /></div>
      </div>
    </div>
  );
}

function Compare() {
  const { bundle, myTeam, teamProfs } = useLeague();
  const { teams, league } = bundle;
  const [a, setA] = useState(myTeam?.id ?? teams[0]?.id ?? '');
  const [b, setB] = useState('');
  const day = useMemo(() => romeDayStart(), []);
  const week = useMemo(() => new Date(Date.now() - 7 * 86_400_000), []);
  const data = useAsync(async () => {
    const [tot, w, d] = await Promise.all([teamScoresBetween(league.id), teamScoresBetween(league.id, week), teamScoresBetween(league.id, day)]);
    return { tot, w, d };
  }, [league.id, day, week], { interval: 60_000 });
  const duels = useAsync(() => listDuels(league.id), [league.id]);
  const get = (list: { team_id: string; score: number }[] | undefined, id: string) => list?.find(s => s.team_id === id)?.score ?? 0;
  const ta = teams.find(t => t.id === a); const tb = teams.find(t => t.id === b);
  const past = (duels.data ?? []).filter(d => d.status === 'finished' && ((d.challenger_team === a && d.opponent_team === b) || (d.challenger_team === b && d.opponent_team === a)));
  const winsA = past.filter(d => d.winner_team === a).length; const winsB = past.filter(d => d.winner_team === b).length;

  if (teams.length < 2) return <Empty title="Servono due squadre">Il confronto compare quando ci sono almeno due squadre.</Empty>;
  return (
    <div className="card">
      <div className="grid grid-2">
        <Field label="Squadra A"><Select value={a} onChange={setA} aria-label="Prima squadra"><option value="">Scegli</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Squadra B"><Select value={b} onChange={setB} aria-label="Seconda squadra"><option value="">Scegli</option>{teams.filter(t => t.id !== a).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      </div>
      {data.loading && !data.data && <Loading rows={2} />}
      {data.error != null && <ErrorState error={data.error} onRetry={data.reload} />}
      {ta && tb && data.data && (
        <>
          <table className="table-sm" style={{ marginTop: 8 }}>
            <thead><tr><th>Punti</th><th className="num"><TeamName name={ta.name} fx={ta.name_fx} /></th><th className="num"><TeamName name={tb.name} fx={tb.name_fx} /></th></tr></thead>
            <tbody>
              {([['Stagione', data.data.tot], ['Ultimi 7 giorni', data.data.w], ['Oggi', data.data.d]] as const).map(([label, list]) => {
                const x = get(list, a); const y = get(list, b);
                return <tr key={label}><td>{label}</td><td className="num" style={x > y ? { fontWeight: 800 } : undefined}>{x}</td><td className="num" style={y > x ? { fontWeight: 800 } : undefined}>{y}</td></tr>;
              })}
              <tr><td>Professori</td><td className="num small">{teamProfs(a).map(p => p.name).join(', ') || '—'}</td><td className="num small">{teamProfs(b).map(p => p.name).join(', ') || '—'}</td></tr>
            </tbody>
          </table>
          <div className="section-title" style={{ marginTop: 14 }}><h3>Scontri diretti</h3><span className="muted small">{winsA} - {winsB}</span></div>
          {!past.length ? <p className="muted small">Nessuna sfida conclusa tra queste due squadre.</p> : past.map(d => (
            <div key={d.id} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span>{d.challenger_pts ?? 0} - {d.opponent_pts ?? 0} {d.challenger_team === a ? '' : '(invertito)'}</span>
              <span className="muted tiny">{d.winner_team ? `Vince ${teams.find(t => t.id === d.winner_team)?.name ?? '?'}` : 'Pareggio'} · {d.ends_at ? fmtDateTime(d.ends_at) : ''}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function Duels() {
  const { bundle, meId, myTeam, userById, reload: reloadLeague } = useLeague();
  const { league, teams } = bundle;
  const duels = useAsync(() => listDuels(league.id), [league.id], { interval: 30_000 });
  const live = useAsync(() => duelLive(league.id), [league.id], { interval: 30_000 });
  const [opp, setOpp] = useState('');
  const refresh = async () => { await Promise.all([duels.reload(), live.reload(), reloadLeague()]); };
  const teamName = (id: string) => teams.find(t => t.id === id)?.name ?? '?';
  const nameOf = (uid: string) => userById(uid)?.username ?? '?';
  const mine = (d: Duel) => d.challenger_user === meId || d.opponent_user === meId;
  const all = (duels.data ?? []).filter(mine);
  const incoming = all.filter(d => d.status === 'pending' && d.opponent_user === meId);
  const sent = all.filter(d => d.status === 'pending' && d.challenger_user === meId);
  const active = all.filter(d => d.status === 'active');
  const done = all.filter(d => d.status === 'finished').slice(0, 10);
  const others = teams.filter(t => t.owner_id !== meId);

  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}><h2>Sfida un giocatore</h2></div>
      {!myTeam ? <Empty title="Serve una squadra">Crea la tua squadra per lanciare sfide.</Empty>
        : !others.length ? <Empty title="Nessun avversario">Serve almeno un'altra squadra nella lega.</Empty> : (
          <div className="card">
            <Field label="Avversario"><Select value={opp} onChange={setOpp} aria-label="Avversario"><option value="">Scegli un giocatore</option>
              {others.map(t => <option key={t.id} value={t.owner_id}>{nameOf(t.owner_id)} — {t.name}</option>)}</Select></Field>
            <ActionButton variant="primary" block disabled={!opp} okMessage="Sfida inviata (valida 48 ore)" onAction={async () => { await proposeDuel(league.id, opp); setOpp(''); await refresh(); }}>Lancia la sfida</ActionButton>
            <p className="hint">Dura 7 giorni dall'accettazione. Vince chi guadagna più punti in quel periodo (bonus, malus e premi): +25 pt al vincitore. Massimo 3 sfide attive.</p>
          </div>
        )}

      {duels.loading && !duels.data && <Loading rows={2} />}
      {duels.error != null && <ErrorState error={duels.error} onRetry={duels.reload} />}

      {incoming.length > 0 && (
        <>
          <div className="section-title"><h2>Ricevute</h2><span className="badge badge-accent">{incoming.length}</span></div>
          <div className="stack">{incoming.map(d => (
            <div key={d.id} className="card">
              <b>{nameOf(d.challenger_user)}</b> ({teamName(d.challenger_team)}) ti sfida · <span className="muted small">scade tra {timeLeft(new Date(new Date(d.created_at).getTime() + 48 * 3_600_000).toISOString())}</span>
              <div className="row" style={{ marginTop: 8 }}>
                <ActionButton variant="primary" size="sm" okMessage="Sfida accettata: si parte!" onAction={async () => { await respondDuel(d.id, true); await refresh(); }}>Accetta</ActionButton>
                <ActionButton size="sm" onAction={async () => { await respondDuel(d.id, false); await refresh(); }}>Rifiuta</ActionButton>
              </div>
            </div>
          ))}</div>
        </>
      )}

      <div className="section-title"><h2>Sfide attive</h2></div>
      {duels.data && !active.length && <Empty title="Nessuna sfida in corso">Accetta o lancia una sfida per iniziare.</Empty>}
      <div className="stack">{active.map(d => {
        const l = live.data?.find(x => x.duel_id === d.id);
        const meIsChallenger = d.challenger_user === meId;
        const mine_ = meIsChallenger ? (l?.challenger_pts ?? 0) : (l?.opponent_pts ?? 0);
        const theirs = meIsChallenger ? (l?.opponent_pts ?? 0) : (l?.challenger_pts ?? 0);
        const myT = meIsChallenger ? d.challenger_team : d.opponent_team; const theirT = meIsChallenger ? d.opponent_team : d.challenger_team;
        return (
          <div key={d.id} className="card">
            <div className="row between"><b>vs {nameOf(meIsChallenger ? d.opponent_user : d.challenger_user)}</b><span className="badge">{d.ends_at ? timeLeft(d.ends_at) : ''}</span></div>
            <VersusBar a={mine_} b={theirs} nameA={teamName(myT)} nameB={teamName(theirT)} />
            <p className="hint">{mine_ > theirs ? 'Stai vincendo' : mine_ < theirs ? 'Stai perdendo' : 'Parità'}</p>
          </div>
        );
      })}</div>

      {sent.length > 0 && (
        <>
          <div className="section-title"><h2>Inviate</h2></div>
          <div className="stack">{sent.map(d => (
            <div key={d.id} className="card row between"><span>In attesa di <b>{nameOf(d.opponent_user)}</b></span>
              <ActionButton size="sm" variant="danger" onAction={async () => { await cancelDuel(d.id); await refresh(); }}>Annulla</ActionButton></div>
          ))}</div>
        </>
      )}

      {done.length > 0 && (
        <>
          <div className="section-title"><h2>Concluse</h2></div>
          <div className="card">{done.map(d => {
            const meIsChallenger = d.challenger_user === meId;
            const myTeamId = meIsChallenger ? d.challenger_team : d.opponent_team;
            const result = d.winner_team == null ? 'Pareggio' : d.winner_team === myTeamId ? 'Vittoria 🏆' : 'Sconfitta';
            return (
              <div key={d.id} className="row between small" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                <span>vs {nameOf(meIsChallenger ? d.opponent_user : d.challenger_user)} · {meIsChallenger ? d.challenger_pts : d.opponent_pts} - {meIsChallenger ? d.opponent_pts : d.challenger_pts}</span>
                <span className={`badge ${result.startsWith('Vittoria') ? 'badge-pos' : ''}`}>{result}</span>
              </div>
            );
          })}</div>
        </>
      )}

      <div className="section-title"><h2>Confronto diretto</h2></div>
      <Compare />
    </>
  );
}
