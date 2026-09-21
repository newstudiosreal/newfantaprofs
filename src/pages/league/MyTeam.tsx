import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionButton, Button, Empty, Field, Pts, TeamName } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { createTeam, listEntitlements, listEvents, listPowerups, renameTeam, setCaptain, setTeamFx } from '@/lib/api';
import { timeAgo, timeLeft } from '@/lib/format';
import { NAME_FX } from '@/lib/premium';
import { TEAM_BUDGET, TEAM_MAX_PROFS, validateSelection } from '@/lib/season';
import { useLeague } from './context';

function TeamBuilder() {
  const { bundle, reload } = useLeague();
  const { professors, league } = bundle;
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const costOf = (id: string) => professors.find(p => p.id === id)?.cost ?? 0;
  const spent = picked.reduce((s, id) => s + costOf(id), 0);
  const problem = validateSelection(picked.map(costOf));
  const over = spent > TEAM_BUDGET;

  if (!professors.length) {
    return <Empty title="Nessun professore">L'admin della lega deve ancora aggiungere i professori.</Empty>;
  }

  const toggle = (id: string) => setPicked(cur => {
    if (cur.includes(id)) return cur.filter(x => x !== id);
    if (cur.length >= TEAM_MAX_PROFS) return cur;
    return [...cur, id];
  });

  return (
    <>
      <div className="card">
        <Field label="Nome della squadra"><input className="input" value={name} maxLength={30} onChange={e => setName(e.target.value)} /></Field>
        <div className="row between small bold"><span>Crediti spesi</span><span>{spent} / {TEAM_BUDGET}</span></div>
        <div className={`budget ${over ? 'over' : ''}`} style={{ margin: '6px 0' }}><i style={{ width: `${Math.min(100, (spent / TEAM_BUDGET) * 100)}%` }} /></div>
        <div className="row between tiny muted"><span>{picked.length}/{TEAM_MAX_PROFS} professori</span><span>{over ? 'Budget superato' : `${TEAM_BUDGET - spent} crediti liberi`}</span></div>
      </div>
      <div className="grid grid-3" style={{ marginTop: 12 }}>
        {professors.map(p => {
          const on = picked.includes(p.id);
          const blocked = !on && (picked.length >= TEAM_MAX_PROFS || spent + p.cost > TEAM_BUDGET);
          return (
            <div key={p.id} className={`prof-card ${on ? 'picked' : ''}`}>
              <div className="row"><span className="prof-photo" aria-hidden="true">{p.name[0]}</span>
                <span style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{p.name}</b><span className="muted small">{p.subject || '—'}</span></span></div>
              <div className="row between"><span className="cost">{p.cost}<small>CREDITI</small></span>
                <Button size="sm" variant={on ? 'primary' : 'default'} disabled={blocked} onClick={() => toggle(p.id)}>{on ? 'Rimuovi' : 'Aggiungi'}</Button></div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'sticky', bottom: 'calc(var(--nav-h) + 8px)', marginTop: 16 }}>
        <ActionButton variant="primary" size="lg" block disabled={!!problem || name.trim().length < 2}
          okMessage="Squadra creata!" onAction={async () => { await createTeam(league.id, name.trim(), picked); await reload(); }}>
          {problem ?? (name.trim().length < 2 ? 'Dai un nome alla squadra' : 'Crea squadra')}
        </ActionButton>
      </div>
    </>
  );
}

export function MyTeam() {
  const { bundle, myTeam, myScore, teamProfs, reload, meId } = useLeague();
  const { profile } = useAuth();
  const { league, profScores } = bundle;
  const [newName, setNewName] = useState('');
  const profs = myTeam ? teamProfs(myTeam.id) : [];
  const ents = useAsync(() => listEntitlements(meId), [meId]);
  const powerups = useAsync(() => listPowerups(league.id, meId), [league.id, meId], { enabled: !!myTeam });
  const events = useAsync(() => listEvents(league.id, 150), [league.id], { enabled: !!myTeam });
  const myEvents = useMemo(() => (events.data ?? []).filter(e => (e.team_id && e.team_id === myTeam?.id) || (e.professor_id && profs.some(p => p.id === e.professor_id))).slice(0, 12),
    [events.data, myTeam?.id, profs]);
  const ownedFx = (ents.data ?? []).filter(e => e.kind === 'name_fx').map(e => e.ref);
  const spent = profs.reduce((s, p) => s + p.cost, 0);

  if (!myTeam) return (<><div className="section-title" style={{ marginTop: 0 }}><h2>Crea la tua squadra</h2></div><TeamBuilder /></>);

  return (
    <>
      <div className="card">
        <div className="row between row-wrap">
          <div><p className="muted small" style={{ margin: 0 }}>La tua squadra</p>
            <h2 style={{ fontSize: '2.2rem' }}><TeamName name={myTeam.name} fx={myTeam.name_fx} /></h2></div>
          <div className="score">{myScore}<small>PUNTI</small></div>
        </div>
        <div className="row row-wrap small muted" style={{ marginTop: 6 }}>
          <span>{profs.length}/{TEAM_MAX_PROFS} professori</span><span>·</span><span>{Math.max(0, TEAM_BUDGET - spent)} crediti liberi</span>
        </div>
      </div>

      <div className="section-title"><h2>I tuoi professori</h2><Link to="../mercato" className="small bold">Vai al mercato</Link></div>
      {!profs.length && <Empty title="Squadra vuota">Compra un professore dal mercato.</Empty>}
      <div className="grid grid-2">
        {profs.map(p => {
          const captain = myTeam.captain_id === p.id;
          const pts = profScores[p.id]?.pts ?? 0;
          return (
            <div key={p.id} className={`prof-card ${captain ? 'captain' : ''}`}>
              <div className="row"><span className="prof-photo" aria-hidden="true">{p.name[0]}</span>
                <span className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{captain && '★ '}{p.name}</b><span className="muted small">{p.subject || '—'}</span></span>
                <Pts value={pts} /></div>
              <div className="row between">
                <span className="cost">{p.cost}<small>CREDITI</small></span>
                <ActionButton size="sm" variant={captain ? 'primary' : 'default'} okMessage={captain ? 'Capitano rimosso' : 'Nuovo capitano!'}
                  onAction={async () => { await setCaptain(myTeam.id, captain ? null : p.id); await reload(); }}>
                  {captain ? 'Capitano (×2)' : 'Nomina capitano'}
                </ActionButton>
              </div>
            </div>
          );
        })}
      </div>

      {(powerups.data?.length ?? 0) > 0 && (
        <>
          <div className="section-title"><h2>Power-up attivi</h2></div>
          <div className="card row row-wrap">
            {powerups.data!.map(u => (
              <span key={u.id} className="badge badge-accent">{u.kind === 'shield' ? '🛡️ Scudo' : '⚡ Moltiplicatore'}{u.expires_at ? ` · ${timeLeft(u.expires_at)}` : ''}</span>
            ))}
          </div>
        </>
      )}

      <div className="section-title"><h2>Nome squadra</h2></div>
      <div className="card">
        <div className="row"><input className="input" placeholder={myTeam.name} value={newName} maxLength={30} onChange={e => setNewName(e.target.value)} aria-label="Nuovo nome" />
          <ActionButton disabled={newName.trim().length < 2} okMessage="Nome aggiornato" onAction={async () => { await renameTeam(myTeam.id, newName.trim()); setNewName(''); await reload(); }}>Rinomina</ActionButton></div>
        {ownedFx.length > 0 && (
          <div className="row row-wrap" style={{ marginTop: 12 }}>
            <span className="muted small">Effetto:</span>
            <ActionButton size="sm" variant={!myTeam.name_fx ? 'primary' : 'default'} onAction={async () => { await setTeamFx(myTeam.id, null); await reload(); }}>Nessuno</ActionButton>
            {NAME_FX.filter(f => ownedFx.includes(f.id)).map(f => (
              <ActionButton key={f.id} size="sm" variant={myTeam.name_fx === f.id ? 'primary' : 'default'} onAction={async () => { await setTeamFx(myTeam.id, f.id); await reload(); }}>{f.emoji} {f.name}</ActionButton>
            ))}
          </div>
        )}
        {!profile?.is_superadmin && ownedFx.length === 0 && <p className="hint">Gli effetti nome si sbloccano con i codici premium (Profilo).</p>}
      </div>

      <div className="section-title"><h2>Storico punti</h2></div>
      {!myEvents.length ? <Empty title="Nessun evento">I punti dei tuoi prof compariranno qui.</Empty> : (
        <div className="card">{myEvents.map(e => (
          <div key={e.id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ minWidth: 0 }}><span className="ellipsis" style={{ display: 'block' }}>{e.label}</span><span className="muted tiny">{timeAgo(e.created_at)}</span></span><Pts value={e.pts} /></div>
        ))}</div>
      )}
    </>
  );
}
