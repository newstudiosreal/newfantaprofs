import { useState } from 'react';
import { ActionButton, Empty, ErrorState, Loading, Modal, Field } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { claimMission, listClaims, listMissions, listTrades, reviewClaim } from '@/lib/api';
import { badgeLabel } from '@/lib/premium';
import type { Mission } from '@/lib/types';
import { useLeague } from './context';

export function Missions() {
  const { bundle, myTeam, myScore, ranking, meId, isAdmin, userById, reload: reloadLeague } = useLeague();
  const { league } = bundle;
  const missions = useAsync(() => listMissions(league.id), [league.id]);
  const claims = useAsync(() => listClaims(league.id), [league.id], { interval: 30_000 });
  const trades = useAsync(() => listTrades(league.id), [league.id]);
  const [manual, setManual] = useState<Mission | null>(null);
  const [note, setNote] = useState('');

  const refresh = async () => { await Promise.all([claims.reload(), reloadLeague()]); };
  const myClaims = (claims.data ?? []).filter(c => c.user_id === meId);
  const status = (id: string) => myClaims.find(c => c.mission_id === id && c.status !== 'rejected')?.status ?? myClaims.find(c => c.mission_id === id)?.status ?? null;
  const pos = myTeam ? ranking.findIndex(r => r.owner_id === meId) + 1 : 0;
  const tradesDone = (trades.data ?? []).filter(t => t.status === 'accepted' && (t.from_user === meId || t.to_user === meId)).length;
  const pendingReview = (claims.data ?? []).filter(c => c.status === 'pending');
  const missionName = (id: string) => missions.data?.find(m => m.id === id)?.label ?? '?';

  const progress = (m: Mission) => {
    if (m.type === 'auto_pts') return `${Math.max(0, myScore)} / ${m.condition} pt`;
    if (m.type === 'auto_trades') return `${tradesDone} / ${m.condition} scambi`;
    if (m.type === 'auto_pos') return pos ? `Posizione #${pos} (serve top ${m.condition})` : 'Crea una squadra';
    return 'Da approvare dall\'admin';
  };

  if (!myTeam) return <Empty title="Serve una squadra">Crea la tua squadra per completare le missioni.</Empty>;

  return (
    <>
      {isAdmin && pendingReview.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 0 }}><h2>Da approvare</h2><span className="badge badge-accent">{pendingReview.length}</span></div>
          <div className="stack">{pendingReview.map(c => (
            <div key={c.id} className="card">
              <b>{userById(c.user_id)?.username ?? '?'}</b> · {missionName(c.mission_id)}
              {c.note && <p className="muted small" style={{ margin: '4px 0' }}>“{c.note}”</p>}
              <div className="row" style={{ marginTop: 8 }}>
                <ActionButton size="sm" variant="primary" okMessage="Approvata" onAction={async () => { await reviewClaim(c.id, true); await refresh(); }}>Approva</ActionButton>
                <ActionButton size="sm" variant="danger" onAction={async () => { await reviewClaim(c.id, false); await refresh(); }}>Rifiuta</ActionButton>
              </div>
            </div>
          ))}</div>
        </>
      )}

      <div className="section-title" style={isAdmin && pendingReview.length ? undefined : { marginTop: 0 }}><h2>Missioni</h2></div>
      {missions.loading && !missions.data && <Loading />}
      {missions.error != null && <ErrorState error={missions.error} onRetry={missions.reload} />}
      {missions.data && !missions.data.length && <Empty title="Nessuna missione">L'admin può aggiungerne da Gestione.</Empty>}
      <div className="stack">
        {missions.data?.map(m => {
          const st = status(m.id);
          return (
            <div key={m.id} className="card row">
              <span className="grow"><b>{m.label}</b>
                <div className="muted small">{m.description}</div>
                <div className="tiny" style={{ marginTop: 4 }}>{progress(m)} · <b>{m.reward === 'pts' ? `+${m.reward_pts} pt` : `Badge ${badgeLabel(m.reward_badge ?? '')}`}</b></div></span>
              {st === 'approved' ? <span className="badge badge-pos">Completata</span>
                : st === 'pending' ? <span className="badge">In revisione</span>
                : m.type === 'manual' ? <ActionButton size="sm" onAction={async () => { setManual(m); }}>{st === 'rejected' ? 'Riprova' : 'Richiedi'}</ActionButton>
                : <ActionButton size="sm" variant="primary" okMessage="Missione completata!" onAction={async () => { await claimMission(m.id); await refresh(); }}>Riscuoti</ActionButton>}
            </div>
          );
        })}
      </div>

      {manual && (
        <Modal title={manual.label} onClose={() => setManual(null)}>
          <p className="muted">{manual.description}</p>
          <Field label="Nota per l'admin (facoltativa)"><textarea className="input" maxLength={200} value={note} onChange={e => setNote(e.target.value)} /></Field>
          <ActionButton variant="primary" block okMessage="Richiesta inviata" onAction={async () => { await claimMission(manual.id, note); setManual(null); setNote(''); await refresh(); }}>Invia richiesta</ActionButton>
        </Modal>
      )}
    </>
  );
}
