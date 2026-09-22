import { useState } from 'react';
import { ActionButton, Button, ConfirmModal, Empty, ErrorState, Field, Loading, Select, VerifiedMark } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import {
  adminCreateCode, adminListCodes, adminListProfiles, adminResetHof, adminSetBan, adminSetLeagueSuspended, adminSetVerified,
  deleteAnnouncement, deleteLeague, getSetting, listAnnouncements, listMyLeagues, saveAnnouncement, setAppMode,
} from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { BADGES, NAME_FX, SKINS } from '@/lib/premium';
import type { Announcement, League } from '@/lib/types';

type Tab = 'utenti' | 'leghe' | 'codici' | 'news' | 'sistema';
const TABS: { id: Tab; label: string }[] = [
  { id: 'utenti', label: 'Utenti' }, { id: 'leghe', label: 'Leghe' }, { id: 'codici', label: 'Codici' }, { id: 'news', label: 'News' }, { id: 'sistema', label: 'Sistema' },
];

function Users() {
  const users = useAsync(adminListProfiles, []);
  const [q, setQ] = useState('');
  const list = (users.data ?? []).filter(u => u.username.toLowerCase().includes(q.toLowerCase()));
  if (users.loading && !users.data) return <Loading />;
  if (users.error != null) return <ErrorState error={users.error} onRetry={users.reload} />;
  return (
    <>
      <input className="input" placeholder="Cerca utente" value={q} onChange={e => setQ(e.target.value)} aria-label="Cerca utente" style={{ marginBottom: 10 }} />
      <div className="card">
        {list.map(u => {
          const banned = !!u.banned_until && new Date(u.banned_until) > new Date();
          return (
            <div key={u.id} className="row between row-wrap" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <span><b>{u.username}</b> <VerifiedMark profile={u} /> {u.is_superadmin && <span className="badge badge-accent">SA</span>} {banned && <span className="badge badge-neg">sospeso fino al {fmtDate(u.banned_until!)}</span>}<div className="tiny muted">dal {fmtDate(u.created_at)}</div></span>
              <span className="row row-wrap">
                <ActionButton size="sm" variant={u.verified ? 'default' : 'primary'} okMessage={u.verified ? 'Spunta rimossa' : 'Spunta assegnata'}
                  onAction={async () => { await adminSetVerified(u.id, !u.verified); await users.reload(); }}>{u.verified ? 'Rimuovi spunta' : 'Assegna spunta'}</ActionButton>
                {!u.is_superadmin && (banned
                  ? <ActionButton size="sm" okMessage="Riattivato" onAction={async () => { await adminSetBan(u.id, null); await users.reload(); }}>Riattiva</ActionButton>
                  : <>
                    <ActionButton size="sm" variant="danger" okMessage="Sospeso 7 giorni" onAction={async () => { await adminSetBan(u.id, new Date(Date.now() + 7 * 86_400_000).toISOString()); await users.reload(); }}>7 giorni</ActionButton>
                    <ActionButton size="sm" variant="danger" okMessage="Sospeso 1 anno" onAction={async () => { await adminSetBan(u.id, new Date(Date.now() + 365 * 86_400_000).toISOString()); await users.reload(); }}>Lungo</ActionButton>
                  </>)}
              </span>
            </div>
          );
        })}
        {!list.length && <Empty title="Nessun utente" />}
      </div>
    </>
  );
}

function Leagues() {
  const leagues = useAsync(listMyLeagues, []);
  const [del, setDel] = useState<League | null>(null);
  if (leagues.loading && !leagues.data) return <Loading />;
  if (leagues.error != null) return <ErrorState error={leagues.error} onRetry={leagues.reload} />;
  return (
    <div className="card">
      {leagues.data?.map(l => (
        <div key={l.id} className="row between row-wrap" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <span><b>{l.name}</b> <span className="code">{l.code}</span> {l.suspended && <span className="badge badge-neg">sospesa</span>}<div className="tiny muted">creata il {fmtDate(l.created_at)}</div></span>
          <span className="row">
            <ActionButton size="sm" onAction={async () => { await adminSetLeagueSuspended(l.id, !l.suspended); await leagues.reload(); }}>{l.suspended ? 'Riattiva' : 'Sospendi'}</ActionButton>
            <Button size="sm" variant="danger" onClick={() => setDel(l)}>Elimina</Button>
          </span>
        </div>
      ))}
      {!leagues.data?.length && <Empty title="Nessuna lega" />}
      {del && <ConfirmModal danger title={`Eliminare ${del.name}?`} confirmLabel="Elimina" text="Cancella la lega e tutti i suoi dati per tutti gli utenti."
        onConfirm={async () => { await deleteLeague(del.id); await leagues.reload(); }} onClose={() => setDel(null)} />}
    </div>
  );
}

function Codes() {
  const codes = useAsync(adminListCodes, []);
  const leagues = useAsync(listMyLeagues, []);
  const toast = useToast();
  const [type, setType] = useState('skin');
  const [ref, setRef] = useState('');
  const [lg, setLg] = useState('');

  const meta = (): Record<string, string> => {
    if (type === 'pro') return { lgId: lg };
    if (['skin', 'badge', 'name_fx', 'custom_badge'].includes(type)) return { ref };
    return {};
  };
  const refOptions = type === 'skin' ? SKINS.slice(1).map(s => [s.id, s.name]) : type === 'badge' ? BADGES.map(b => [b.id, b.name]) : type === 'name_fx' ? NAME_FX.map(f => [f.id, f.name]) : [];
  const ready = type === 'pro' ? !!lg : ['skin', 'badge', 'name_fx', 'custom_badge'].includes(type) ? !!ref : true;

  return (
    <>
      <div className="card">
        <Field label="Tipo di codice"><Select value={type} onChange={v => { setType(v); setRef(''); }} aria-label="Tipo codice">
          <option value="skin">Skin</option><option value="skin_bundle">Pacchetto skin</option><option value="badge">Badge</option><option value="badge_bundle">Pacchetto badge</option>
          <option value="name_fx">Effetto nome</option><option value="custom_badge">Badge personalizzato</option><option value="pro">Lega Pro</option></Select></Field>
        {refOptions.length > 0 && <Field label="Quale"><Select value={ref} onChange={setRef} aria-label="Elemento"><option value="">Scegli</option>{refOptions.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></Field>}
        {type === 'custom_badge' && <Field label="Testo del badge"><input className="input" maxLength={30} value={ref} onChange={e => setRef(e.target.value)} /></Field>}
        {type === 'pro' && <Field label="Lega"><Select value={lg} onChange={setLg} aria-label="Lega"><option value="">Scegli</option>{leagues.data?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>}
        <ActionButton variant="primary" disabled={!ready} onAction={async () => {
          const c = await adminCreateCode(type, meta());
          try { await navigator.clipboard?.writeText(c); toast.ok(`Codice ${c} copiato`); } catch { toast.ok(`Codice: ${c}`); }
          await codes.reload();
        }}>Genera codice</ActionButton>
      </div>
      <div className="section-title"><h2>Codici generati</h2></div>
      {codes.error != null && <ErrorState error={codes.error} onRetry={codes.reload} />}
      <div className="card">
        {codes.data?.map(c => (
          <div key={c.code} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', opacity: c.used_by ? .5 : 1 }}>
            <span><span className="code">{c.code}</span> <span className="muted small">{c.type}{c.meta?.ref ? ` · ${c.meta.ref}` : ''}</span></span>
            <span className="badge">{c.used_by ? 'usato' : 'libero'}</span>
          </div>
        ))}
        {codes.data && !codes.data.length && <Empty title="Nessun codice" />}
      </div>
    </>
  );
}

function NewsAdmin() {
  const news = useAsync(listAnnouncements, []);
  const [edit, setEdit] = useState<Partial<Announcement> | null>(null);
  return (
    <>
      <Button variant="primary" onClick={() => setEdit({ title: '', body: '', tag: '', pinned: false })}>Nuovo annuncio</Button>
      {edit && (
        <div className="card" style={{ marginTop: 12 }}>
          <Field label="Titolo"><input className="input" maxLength={120} value={edit.title ?? ''} onChange={e => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="Testo"><textarea className="input" rows={5} maxLength={4000} value={edit.body ?? ''} onChange={e => setEdit({ ...edit, body: e.target.value })} /></Field>
          <Field label="Etichetta (facoltativa)"><input className="input" maxLength={20} value={edit.tag ?? ''} onChange={e => setEdit({ ...edit, tag: e.target.value })} /></Field>
          <label className="row" style={{ marginBottom: 12 }}><input type="checkbox" checked={!!edit.pinned} onChange={e => setEdit({ ...edit, pinned: e.target.checked })} /> In evidenza</label>
          <div className="row"><ActionButton variant="primary" disabled={!edit.title?.trim() || !edit.body?.trim()} okMessage="Annuncio salvato"
            onAction={async () => { await saveAnnouncement({ ...edit, title: edit.title!.trim(), body: edit.body!.trim() }); setEdit(null); await news.reload(); }}>Salva</ActionButton>
            <Button variant="ghost" onClick={() => setEdit(null)}>Annulla</Button></div>
        </div>
      )}
      <div className="stack" style={{ marginTop: 12 }}>
        {news.data?.map(a => (
          <div key={a.id} className="card row between"><span><b>{a.pinned && '📌 '}{a.title}</b><div className="tiny muted">{fmtDate(a.created_at)}</div></span>
            <span className="row"><Button size="sm" onClick={() => setEdit(a)}>Modifica</Button>
              <ActionButton size="sm" variant="danger" onAction={async () => { await deleteAnnouncement(a.id); await news.reload(); }}>Elimina</ActionButton></span></div>
        ))}
      </div>
    </>
  );
}

function System() {
  const mode = useAsync(() => getSetting<string>('app_mode', 'normal'), []);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="stack">
      <div className="card">
        <h3>Modalità app</h3>
        <p className="muted small">In modalità estate o manutenzione gli utenti (tranne i SuperAdmin) vedono una schermata di attesa.</p>
        <div className="row row-wrap">
          {(['normal', 'estate', 'maintenance'] as const).map(m => (
            <ActionButton key={m} variant={mode.data === m ? 'primary' : 'default'} okMessage="Modalità aggiornata" onAction={async () => { await setAppMode(m); await mode.reload(); }}>
              {m === 'normal' ? 'Normale' : m === 'estate' ? 'Estate' : 'Manutenzione'}</ActionButton>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>Hall of Fame</h3>
        <p className="muted small">Azzera la classifica globale: conteranno solo i punti da adesso in poi. Le leghe non vengono toccate.</p>
        <Button variant="danger" onClick={() => setConfirm(true)}>Azzera Hall of Fame</Button>
      </div>
      {confirm && <ConfirmModal danger title="Azzerare la Hall of Fame?" confirmLabel="Azzera" text="Ripartirà da zero per tutti."
        onConfirm={async () => { await adminResetHof(); }} onClose={() => setConfirm(false)} />}
    </div>
  );
}

export default function SuperAdmin() {
  const [tab, setTab] = useState<Tab>('utenti');
  return (
    <main className="page">
      <h1 style={{ fontSize: '3rem', marginBottom: 12 }}>SuperAdmin</h1>
      <div className="row row-wrap" style={{ marginBottom: 14 }} role="tablist">
        {TABS.map(t => <Button key={t.id} size="sm" variant={tab === t.id ? 'primary' : 'default'} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Button>)}
      </div>
      {tab === 'utenti' && <Users />}{tab === 'leghe' && <Leagues />}{tab === 'codici' && <Codes />}{tab === 'news' && <NewsAdmin />}{tab === 'sistema' && <System />}
    </main>
  );
}
