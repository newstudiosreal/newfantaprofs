import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionButton, Button, ConfirmModal, Empty, Field, Pts, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import {
  addCustomEvent, addEvents, addMission, deleteEvent, deleteLeague, deleteMission, listEvents, listMissions,
  removeCatalogEvent, removeMember, resetLeague, setMemberRole, setMissionsEnabled,
} from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { CatalogEvent } from '@/lib/types';
import { useLeague } from './context';

function EventRegister() {
  const { bundle, reload } = useLeague();
  const { league, professors } = bundle;
  const [prof, setProf] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (id: string) => setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));
  const group = (title: string, items: CatalogEvent[]) => (
    <>
      <div className="small bold muted" style={{ margin: '10px 0 4px' }}>{title}</div>
      <div className="row row-wrap">
        {items.map(e => (
          <Button key={e.id} size="sm" variant={chosen.includes(e.id) ? 'primary' : 'default'} onClick={() => toggle(e.id)} aria-pressed={chosen.includes(e.id)}>
            {e.label} <span className={`pts ${e.pts > 0 ? '' : ''}`} style={{ fontSize: '1rem' }}>{e.pts > 0 ? `+${e.pts}` : e.pts}</span>
          </Button>
        ))}
      </div>
    </>
  );
  if (!professors.length) return <Empty title="Nessun professore">Aggiungi prima i professori dalla scheda Professori.</Empty>;
  return (
    <div className="card">
      <Field label="Professore"><Select value={prof} onChange={setProf} aria-label="Professore"><option value="">Scegli</option>{professors.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      {group('Bonus', league.bonus)}{group('Malus', league.malus)}{group('Premi speciali', league.premi)}
      <div style={{ marginTop: 14 }}>
        <ActionButton variant="primary" block disabled={!prof || !chosen.length} okMessage="Eventi registrati"
          onAction={async () => { await addEvents(league.id, chosen.map(k => ({ professor_id: prof, event_key: k }))); setChosen([]); await reload(); }}>
          Registra {chosen.length > 1 ? `${chosen.length} eventi` : 'evento'}
        </ActionButton>
      </div>
    </div>
  );
}

export function Admin() {
  const { bundle, isOwner, isSuper, meId, userById, profById, reload } = useLeague();
  const { league, members } = bundle;
  const nav = useNavigate();
  const events = useAsync(() => listEvents(league.id, 15), [league.id]);
  const missions = useAsync(() => listMissions(league.id), [league.id]);
  const [cLabel, setCLabel] = useState(''); const [cPts, setCPts] = useState('10'); const [cKind, setCKind] = useState<'bonus' | 'malus'>('bonus');
  const [mLabel, setMLabel] = useState(''); const [mDesc, setMDesc] = useState(''); const [mPts, setMPts] = useState('50');
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);
  const custom = [...league.bonus, ...league.malus].filter(e => e.id.startsWith('c_'));
  const refresh = async () => { await Promise.all([reload(), events.reload(), missions.reload()]); };

  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}><h2>Registra eventi</h2></div>
      <EventRegister />

      <div className="section-title"><h2>Ultimi registrati</h2></div>
      {events.data && !events.data.length && <Empty title="Niente ancora">Gli eventi registrati compaiono qui.</Empty>}
      <div className="card" style={events.data?.length ? undefined : { display: 'none' }}>
        {events.data?.map(e => (
          <div key={e.id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ minWidth: 0 }}><span className="ellipsis" style={{ display: 'block' }}>{e.label}</span><span className="muted tiny">{(e.professor_id && profById(e.professor_id)?.name) || 'Squadra'} · {timeAgo(e.created_at)}</span></span>
            <span className="row"><Pts value={e.pts} /><ActionButton size="sm" variant="ghost" aria-label="Elimina evento" onAction={async () => { await deleteEvent(e.id); await refresh(); }}>✕</ActionButton></span>
          </div>
        ))}
      </div>

      <div className="section-title"><h2>Eventi personalizzati</h2></div>
      <div className="card">
        <div className="row row-wrap">
          <Select value={cKind} onChange={v => setCKind(v as 'bonus' | 'malus')} aria-label="Tipo"><option value="bonus">Bonus</option><option value="malus">Malus</option></Select>
        </div>
        <Field label="Descrizione"><input className="input" value={cLabel} maxLength={80} onChange={e => setCLabel(e.target.value)} /></Field>
        <Field label="Punti" hint={cKind === 'bonus' ? 'Numero positivo (max 500)' : 'Numero negativo (es. -30)'}><input className="input" inputMode="numeric" value={cPts} onChange={e => setCPts(e.target.value.replace(/[^\d-]/g, ''))} /></Field>
        <ActionButton variant="primary" disabled={cLabel.trim().length < 2 || !Number(cPts)} okMessage="Evento aggiunto al catalogo"
          onAction={async () => { await addCustomEvent(league.id, cKind, cLabel.trim(), Number(cPts)); setCLabel(''); await refresh(); }}>Aggiungi al catalogo</ActionButton>
        {custom.map(c => (
          <div key={c.id} className="row between" style={{ marginTop: 10 }}><span>{c.label} <b>{c.pts > 0 ? `+${c.pts}` : c.pts}</b></span>
            <ActionButton size="sm" variant="danger" onAction={async () => { await removeCatalogEvent(league.id, c.id); await refresh(); }}>Rimuovi</ActionButton></div>
        ))}
      </div>

      <div className="section-title"><h2>Missioni</h2></div>
      <div className="card">
        <div className="row between"><span>Missioni {league.missions_enabled ? 'attive' : 'disattivate'}</span>
          <ActionButton size="sm" onAction={async () => { await setMissionsEnabled(league.id, !league.missions_enabled); await refresh(); }}>{league.missions_enabled ? 'Disattiva' : 'Attiva'}</ActionButton></div>
        <Field label="Nuova missione manuale"><input className="input" placeholder="Titolo" maxLength={60} value={mLabel} onChange={e => setMLabel(e.target.value)} /></Field>
        <Field label="Descrizione"><input className="input" maxLength={200} value={mDesc} onChange={e => setMDesc(e.target.value)} /></Field>
        <Field label="Premio (pt)"><input className="input" inputMode="numeric" value={mPts} onChange={e => setMPts(e.target.value.replace(/\D/g, ''))} /></Field>
        <ActionButton variant="primary" disabled={mLabel.trim().length < 2 || !Number(mPts)} okMessage="Missione creata"
          onAction={async () => { await addMission(league.id, mLabel.trim(), mDesc.trim(), Number(mPts)); setMLabel(''); setMDesc(''); await refresh(); }}>Crea missione</ActionButton>
        {missions.data?.map(m => (
          <div key={m.id} className="row between" style={{ marginTop: 10 }}><span className="small">{m.label} <span className="muted">({m.type === 'manual' ? 'manuale' : 'auto'})</span></span>
            <ActionButton size="sm" variant="danger" onAction={async () => { await deleteMission(m.id); await refresh(); }}>Elimina</ActionButton></div>
        ))}
      </div>

      <div className="section-title"><h2>Membri</h2></div>
      <div className="card">
        {members.map(m => {
          const u = userById(m.user_id); const owner = m.user_id === league.owner_id;
          return (
            <div key={m.user_id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
              <span>{u?.username ?? '?'} <span className="badge">{owner ? 'Proprietario' : m.role === 'coadmin' ? 'Co-admin' : 'Membro'}</span></span>
              {!owner && (
                <span className="row">
                  {isOwner && <ActionButton size="sm" onAction={async () => { await setMemberRole(league.id, m.user_id, m.role === 'coadmin' ? 'member' : 'coadmin'); await refresh(); }}>{m.role === 'coadmin' ? 'Togli admin' : 'Rendi admin'}</ActionButton>}
                  {m.user_id !== meId && <ActionButton size="sm" variant="danger" onAction={async () => { await removeMember(league.id, m.user_id); await refresh(); }}>Espelli</ActionButton>}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {(isOwner || isSuper) && (
        <>
          <div className="section-title"><h2>Zona pericolosa</h2></div>
          <div className="card row row-wrap">
            <Button variant="danger" onClick={() => setConfirm('reset')}>Azzera stagione</Button>
            <Button variant="danger" onClick={() => setConfirm('delete')}>Elimina lega</Button>
          </div>
        </>
      )}
      {confirm === 'reset' && <ConfirmModal danger title="Azzerare la stagione?" confirmLabel="Azzera" text="Cancella tutti gli eventi, i messaggi, gli scambi, il mercato e i pronostici della lega. Le squadre restano. Non si può annullare."
        onConfirm={async () => { await resetLeague(league.id); await refresh(); }} onClose={() => setConfirm(null)} />}
      {confirm === 'delete' && <ConfirmModal danger title="Eliminare la lega?" confirmLabel="Elimina definitivamente" text="La lega, le squadre e tutti i dati collegati vengono cancellati per tutti."
        onConfirm={async () => { await deleteLeague(league.id); nav('/', { replace: true }); }} onClose={() => setConfirm(null)} />}
    </>
  );
}
