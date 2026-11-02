import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ActionButton, Button, ConfirmModal, Empty, Field, Pts, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import {
  addCustomEvent, addMission, deleteEvent, deleteLeague, deleteMission, listEvents, listMissions,
  removeCatalogEvent, removeMember, setMemberRole, setMissionsEnabled,
} from '@/lib/api';
import { crossProduct, listAllEvents, registerEventsBulk, setCoadminPerms, undoLastEvents, listProposals } from '@/lib/api.social';
import { downloadCsv, safeFilename, toCsv } from '@/lib/csv';
import { fmtDateTime, timeAgo } from '@/lib/format';
import type { CatalogEvent } from '@/lib/types';
import { COADMIN_PERM_LABELS, type CoadminPerm } from '@/lib/types.social';
import { InviteCard } from './InviteCard';
import { SeasonSettings } from './AdminSeason';
import { useLeague } from './context';

function EventRegister() {
  const { bundle, reload } = useLeague();
  const { league, professors } = bundle;
  const [profs, setProfs] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [undoOpen, setUndoOpen] = useState(false);
  const toggle = (id: string) => setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));
  const toggleProf = (id: string) => setProfs(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));
  const total = profs.length * chosen.length;
  const group = (title: string, items: CatalogEvent[]) => (
    <>
      <div className="small bold muted" style={{ margin: '10px 0 4px' }}>{title}</div>
      <div className="row row-wrap">
        {items.map(e => (
          <Button key={e.id} size="sm" variant={chosen.includes(e.id) ? 'primary' : 'default'} onClick={() => toggle(e.id)} aria-pressed={chosen.includes(e.id)}>
            {e.label} <span className="pts" style={{ fontSize: '1rem' }}>{e.pts > 0 ? `+${e.pts}` : e.pts}</span>
          </Button>
        ))}
      </div>
    </>
  );
  if (!professors.length) return <Empty title="Nessun professore">Aggiungi prima i professori dalla scheda Professori.</Empty>;
  return (
    <div className="card">
      <div className="row between row-wrap">
        <span className="small bold muted">Professori ({profs.length} selezionati)</span>
        <span className="row">
          <Button size="sm" variant="ghost" onClick={() => setProfs(professors.map(p => p.id))}>Tutti</Button>
          <Button size="sm" variant="ghost" onClick={() => setProfs([])} disabled={!profs.length}>Nessuno</Button>
        </span>
      </div>
      <div className="row row-wrap" style={{ marginTop: 6 }}>
        {professors.map(p => (
          <Button key={p.id} size="sm" variant={profs.includes(p.id) ? 'primary' : 'default'} onClick={() => toggleProf(p.id)} aria-pressed={profs.includes(p.id)}>{p.name}</Button>
        ))}
      </div>
      {group('Bonus', league.bonus)}{group('Malus', league.malus)}{group('Premi speciali', league.premi)}
      <div className="row row-wrap" style={{ marginTop: 14 }}>
        <ActionButton variant="primary" disabled={!total} okMessage="Eventi registrati"
          onAction={async () => { const n = await registerEventsBulk(league.id, crossProduct(profs, chosen)); setChosen([]); await reload(); return n; }}>
          {total ? `Registra ${total} ${total === 1 ? 'evento' : 'eventi'}` : 'Scegli professori ed eventi'}
        </ActionButton>
        <Button variant="ghost" onClick={() => setUndoOpen(true)}>↩︎ Annulla ultima registrazione</Button>
      </div>
      {total > 1 && <p className="hint">{profs.length} professori × {chosen.length} eventi. Se sbagli, "Annulla ultima registrazione" toglie tutto il gruppo.</p>}
      {undoOpen && <ConfirmModal danger title="Annullare l'ultima registrazione?" confirmLabel="Annulla registrazione"
        text="Elimina gli eventi che hai registrato per ultimi (tutto il gruppo inserito insieme) e restituisce eventuali scudi o moltiplicatori consumati."
        onConfirm={async () => { await undoLastEvents(league.id); await reload(); }} onClose={() => setUndoOpen(false)} />}
    </div>
  );
}

function CoadminPermissions() {
  const { bundle, reload } = useLeague();
  const { league } = bundle;
  const [draft, setDraft] = useState<Record<CoadminPerm, boolean>>({
    events: league.coadmin_perms?.events ?? true, members: league.coadmin_perms?.members ?? false, missions: league.coadmin_perms?.missions ?? true,
  });
  const keys = Object.keys(COADMIN_PERM_LABELS) as CoadminPerm[];
  return (
    <div className="card">
      <p className="muted small" style={{ marginTop: 0 }}>Scegli cosa possono fare i co-admin. Il proprietario può sempre tutto.</p>
      {keys.map(k => (
        <label key={k} className="perm-row">
          <input type="checkbox" checked={draft[k]} onChange={e => setDraft(d => ({ ...d, [k]: e.target.checked }))} />
          <span><b>{COADMIN_PERM_LABELS[k].label}</b><span className="muted small" style={{ display: 'block' }}>{COADMIN_PERM_LABELS[k].desc}</span></span>
        </label>
      ))}
      <ActionButton variant="primary" okMessage="Permessi salvati"
        onAction={async () => { await setCoadminPerms(league.id, draft); await reload(); }}>Salva permessi</ActionButton>
    </div>
  );
}

function ExportCard() {
  const { bundle, userById, profById, teamProfs } = useLeague();
  const { league, teams } = bundle;
  const base = safeFilename(league.name);
  const today = new Date().toISOString().slice(0, 10);
  const exportRanking = async () => {
    const rows = bundle.scores.map((s, i) => [
      i + 1, s.name, userById(s.owner_id)?.username ?? '', s.score,
      teamProfs(s.team_id).map(p => (p.id === s.captain_id ? `${p.name} (C)` : p.name)).join(', '),
    ]);
    downloadCsv(`${base}_classifica_${today}.csv`, toCsv(['Posizione', 'Squadra', 'Giocatore', 'Punti', 'Professori'], rows));
  };
  const exportEvents = async () => {
    const evs = await listAllEvents(league.id);
    const rows = evs.map(e => [
      fmtDateTime(e.created_at),
      (e.professor_id && profById(e.professor_id)?.name) || (e.team_id && `Squadra ${teams.find(t => t.id === e.team_id)?.name ?? ''}`) || '',
      e.label, e.kind, e.pts, e.created_by ? userById(e.created_by)?.username ?? '' : 'Sistema',
    ]);
    downloadCsv(`${base}_eventi_${today}.csv`, toCsv(['Data', 'Professore / squadra', 'Evento', 'Tipo', 'Punti', 'Registrato da'], rows));
  };
  return (
    <div className="card row row-wrap">
      <ActionButton onAction={exportRanking} okMessage="Classifica esportata">⬇ Classifica (CSV)</ActionButton>
      <ActionButton onAction={exportEvents} okMessage="Registro esportato">⬇ Registro eventi (CSV)</ActionButton>
    </div>
  );
}

export function Admin() {
  const { bundle, isOwner, isSuper, meId, userById, profById, reload, can } = useLeague();
  const { league, members } = bundle;
  const nav = useNavigate();
  const events = useAsync(() => listEvents(league.id, 15), [league.id]);
  const missions = useAsync(() => listMissions(league.id), [league.id]);
  const [cLabel, setCLabel] = useState(''); const [cPts, setCPts] = useState('10'); const [cKind, setCKind] = useState<'bonus' | 'malus'>('bonus');
  const [mLabel, setMLabel] = useState(''); const [mDesc, setMDesc] = useState(''); const [mPts, setMPts] = useState('50');
  const [confirm, setConfirm] = useState<'delete' | null>(null);
  const pending = useAsync(() => listProposals(league.id), [league.id], { enabled: can('events') });
  const pendingCount = (pending.data ?? []).filter(p => p.status === 'pending').length;
  const custom = [...league.bonus, ...league.malus].filter(e => e.id.startsWith('c_'));
  const refresh = async () => { await Promise.all([reload(), events.reload(), missions.reload()]); };

  return (
    <>
      {!can('events') && !can('members') && !can('missions') && (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Il proprietario non ti ha ancora concesso permessi di gestione. Puoi comunque invitare giocatori ed esportare i dati.</p></div>
      )}
      {can('events') && (
        <>
          <div className="section-title" style={{ marginTop: 0 }}><h2>Registra eventi</h2>
            {pendingCount > 0 && <Link to="../proposte" className="badge badge-accent">📝 {pendingCount} {pendingCount === 1 ? 'proposta' : 'proposte'} da valutare</Link>}</div>
          <EventRegister />
        </>
      )}

      <div className="section-title"><h2>Ultimi registrati</h2></div>
      {events.data && !events.data.length && <Empty title="Niente ancora">Gli eventi registrati compaiono qui.</Empty>}
      <div className="card" style={events.data?.length ? undefined : { display: 'none' }}>
        {events.data?.map(e => (
          <div key={e.id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ minWidth: 0 }}><span className="ellipsis" style={{ display: 'block' }}>{e.label}</span><span className="muted tiny">{(e.professor_id && profById(e.professor_id)?.name) || 'Squadra'} · {timeAgo(e.created_at)}</span></span>
            <span className="row"><Pts value={e.pts} />{can('events') && <ActionButton size="sm" variant="ghost" aria-label="Elimina evento" onAction={async () => { await deleteEvent(e.id); await refresh(); }}>✕</ActionButton>}</span>
          </div>
        ))}
      </div>

      {can('events') && <>
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

      </>}

      {can('missions') && <>
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

      </>}

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
                  {can('members') && m.user_id !== meId && <ActionButton size="sm" variant="danger" onAction={async () => { await removeMember(league.id, m.user_id); await refresh(); }}>Espelli</ActionButton>}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-title"><h2>Invita giocatori</h2></div>
      <InviteCard code={league.code} leagueName={league.name} />

      {(isOwner || isSuper) && (
        <>
          <div className="section-title"><h2>Permessi dei co-admin</h2></div>
          <CoadminPermissions />
        </>
      )}

      <SeasonSettings league={league} reload={refresh} canClose={isOwner || isSuper} />

      <div className="section-title"><h2>Esporta dati</h2></div>
      <ExportCard />

      {(isOwner || isSuper) && (
        <>
          <div className="section-title"><h2>Zona pericolosa</h2></div>
          <div className="card row row-wrap">
            <Button variant="danger" onClick={() => setConfirm('delete')}>Elimina lega</Button>
          </div>
        </>
      )}
      {confirm === 'delete' && <ConfirmModal danger title="Eliminare la lega?" confirmLabel="Elimina definitivamente" text="La lega, le squadre e tutti i dati collegati vengono cancellati per tutti."
        onConfirm={async () => { await deleteLeague(league.id); nav('/', { replace: true }); }} onClose={() => setConfirm(null)} />}
    </>
  );
}
