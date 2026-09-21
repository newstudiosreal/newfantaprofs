import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ActionButton, Button, Empty, ErrorState, Field, Loading, Modal, Pts } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { createLeague, joinLeague, leagueRanks, listMyLeagues, pendingTradesForMe, teamSpending } from '@/lib/api';
import { seasonInfo, TEAM_BUDGET, TEAM_MAX_PROFS } from '@/lib/season';

const TUTORIAL_KEY = 'fp_tutorial_seen';

async function loadDashboard(userId: string) {
  const leagues = await listMyLeagues();
  const ids = leagues.map(l => l.id);
  const [scores, pending] = await Promise.all([leagueRanks(ids), pendingTradesForMe(userId)]);
  const mine = scores.filter(s => s.owner_id === userId);
  const spend = await teamSpending(mine.map(t => t.team_id));
  return { leagues, scores, mine, spend, pending };
}

export function Dashboard() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const uid = profile!.id;
  const { data, error, loading, reload } = useAsync(() => loadDashboard(uid), [uid], { interval: 45_000 });
  const [modal, setModal] = useState<'create' | 'join' | 'tutorial' | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    try { if (!localStorage.getItem(TUTORIAL_KEY)) setModal('tutorial'); } catch { /* ignora */ }
  }, []);
  const closeTutorial = () => { try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignora */ } setModal(null); };
  const close = () => { setModal(null); setText(''); };

  return (
    <main className="page">
      <div className="row between row-wrap">
        <div>
          <p className="muted" style={{ margin: 0 }}>Benvenuto,</p>
          <h1 style={{ fontSize: 'clamp(2.4rem, 9vw, 3.6rem)' }}>{profile!.username} 👋</h1>
        </div>
        <div className="row">
          <Button onClick={() => setModal('join')}>Entra in una lega</Button>
          <Button variant="primary" onClick={() => setModal('create')}>Crea lega</Button>
        </div>
      </div>

      <div className="section-title"><h2>Le tue leghe</h2></div>
      {loading && <Loading />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !data.leagues.length && (
        <Empty title="Nessuna lega, per ora">
          <p>Crea una lega per la tua classe oppure entra con il codice che ti ha dato un compagno.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Button onClick={() => setModal('join')}>Ho un codice</Button>
            <Button variant="primary" onClick={() => setModal('create')}>Crea lega</Button>
          </div>
        </Empty>
      )}

      <div className="grid grid-2">
        {data?.leagues.map(lg => {
          const my = data.mine.find(t => t.league_id === lg.id);
          const table = data.scores.filter(s => s.league_id === lg.id).sort((a, b) => b.score - a.score);
          const pos = my ? table.findIndex(t => t.team_id === my.team_id) + 1 : 0;
          const sp = my ? data.spend[my.team_id] : undefined;
          const season = seasonInfo(lg.season_start);
          const pend = data.pending[lg.id] ?? 0;
          return (
            <article key={lg.id} className="card stack">
              <div className="row between">
                <h3 className="ellipsis">{lg.name}</h3>
                <span className="badge">{season.active ? `Stagione ${season.num} · ${season.left}g` : `Pausa · ${season.left}g`}</span>
              </div>
              {lg.suspended && <span className="badge badge-neg">Lega sospesa</span>}
              {my ? (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', textAlign: 'center' }}>
                  <div><div className="score" style={{ textAlign: 'center' }}>#{pos}<small>POSIZIONE</small></div></div>
                  <div><div className="score" style={{ textAlign: 'center' }}><Pts value={my.score} /><small>PUNTI</small></div></div>
                  <div><div className="score" style={{ textAlign: 'center' }}>{sp?.count ?? 0}/{TEAM_MAX_PROFS}<small>PROF</small></div>
                    <div className="tiny muted">{TEAM_BUDGET - (sp?.spent ?? 0)} crediti liberi</div></div>
                </div>
              ) : <p className="muted small" style={{ margin: 0 }}>Non hai ancora una squadra in questa lega.</p>}
              <div className="row row-wrap">
                <Link to={`/leghe/${lg.id}/squadra`} className="btn btn-sm btn-primary">{my ? 'La mia squadra' : 'Crea squadra'}</Link>
                <Link to={`/leghe/${lg.id}`} className="btn btn-sm">Classifica</Link>
                <Link to={`/leghe/${lg.id}/professori`} className="btn btn-sm">Professori</Link>
                {pend > 0 && <Link to={`/leghe/${lg.id}/scambi`} className="badge badge-accent">{pend} scambi in attesa</Link>}
              </div>
            </article>
          );
        })}
      </div>

      {modal === 'create' && (
        <Modal title="Crea una lega" onClose={close}>
          <Field label="Nome della lega" hint="Es. 5B Liceo Scientifico">
            <input className="input" value={text} maxLength={40} onChange={e => setText(e.target.value)} autoFocus />
          </Field>
          <ActionButton variant="primary" block disabled={text.trim().length < 2} onAction={async () => {
            const id = await createLeague(text.trim()); close(); nav(`/leghe/${id}/professori`);
          }}>Crea lega</ActionButton>
        </Modal>
      )}
      {modal === 'join' && (
        <Modal title="Entra in una lega" onClose={close}>
          <Field label="Codice lega" hint="6 caratteri, te lo dà l'admin della lega">
            <input className="input" value={text} maxLength={6} autoCapitalize="characters" onChange={e => setText(e.target.value.toUpperCase())} autoFocus />
          </Field>
          <ActionButton variant="primary" block disabled={text.length !== 6} onAction={async () => {
            const id = await joinLeague(text); close(); nav(`/leghe/${id}`);
          }}>Entra</ActionButton>
        </Modal>
      )}
      {modal === 'tutorial' && (
        <Modal title="Benvenuto in FantaProf" onClose={closeTutorial}>
          <ol className="stack" style={{ paddingLeft: 18 }}>
            <li><b>Entra in una lega</b> con il codice della tua classe, o creane una.</li>
            <li><b>Scegli fino a 4 prof</b> con 50 crediti di budget e nomina un capitano.</li>
            <li><b>Scala la classifica</b>: ogni evento in classe assegna punti ai tuoi prof.</li>
          </ol>
          <Button variant="primary" block onClick={closeTutorial}>Ho capito</Button>
        </Modal>
      )}
    </main>
  );
}
