import { useState } from 'react';
import { ActionButton, Button, ConfirmModal, Empty, ErrorState, Field, Loading, Modal, Select, VerifiedMark } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import {
  adminAddTeamProfessor, adminAdjustPoints, adminCreateCode, adminCloseReport, adminFindConversation, adminListAudit,
  adminListCodes, adminListProfiles, adminListReports, adminRemoveAvatar, adminRemoveTeamProfessor, adminResetPassword,
  adminSetBan, adminSetLeagueSuspended, adminSetVerified, adminTakeReport, adminUpdateUsername,
  deleteAnnouncement, deleteLeague, getSetting, listAnnouncements, listMyLeagues, loadLeagueBundle, saveAnnouncement, setAppMode,
} from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { BADGES, NAME_FX, SKINS } from '@/lib/premium';
import type { Announcement, DirectMessage, League, Profile, Report, ReportReason, ReportStatus } from '@/lib/types';

type Tab = 'utenti' | 'leghe' | 'codici' | 'news' | 'segnalazioni' | 'punti' | 'audit' | 'sistema';
const TABS: { id: Tab; label: string }[] = [
  { id: 'utenti', label: 'Utenti' }, { id: 'leghe', label: 'Leghe' }, { id: 'codici', label: 'Codici' }, { id: 'news', label: 'News' },
  { id: 'segnalazioni', label: 'Segnalazioni' }, { id: 'punti', label: 'Punti & Prof' }, { id: 'audit', label: 'Audit log' }, { id: 'sistema', label: 'Sistema' },
];

const REASON_LABEL: Record<ReportReason, string> = {
  insulti: 'Insulti', spam: 'Spam', comportamento: 'Comportamento scorretto', abuso_chat: 'Abuso della chat', profilo: 'Profilo inappropriato', altro: 'Altro',
};
const STATUS_LABEL: Record<ReportStatus, string> = { in_attesa: '🟡 In attesa', in_esame: '🔵 In esame', risolta: '🟢 Risolta', archiviata: '⚫ Archiviata' };

function UserManageModal({ user, onClose, onChanged }: { user: Profile; onClose: () => void; onChanged: () => void }) {
  const [username, setUsername] = useState(user.username);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [confirmAvatar, setConfirmAvatar] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <Modal title={`Gestisci @${user.username}`} onClose={onClose}>
      <Field label="Username" hint="3-20 caratteri, lettere/numeri/_">
        <input className="input" value={username} maxLength={20} onChange={e => setUsername(e.target.value)} />
      </Field>
      <ActionButton size="sm" disabled={username.trim() === user.username || username.trim().length < 3} okMessage="Username aggiornato"
        onAction={async () => { await adminUpdateUsername(user.id, username.trim()); onChanged(); }}>Salva username</ActionButton>

      <div className="row row-wrap" style={{ marginTop: 16 }}>
        {user.avatar_url && <Button size="sm" variant="danger" onClick={() => setConfirmAvatar(true)}>🗑️ Rimuovi foto profilo</Button>}
        <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>🔑 Reset password</Button>
      </div>

      {tempPw && (
        <div className="card-flat" style={{ marginTop: 12 }}>
          <p className="small bold" style={{ margin: '0 0 6px' }}>Password temporanea — comunicala all'utente, non verrà mostrata di nuovo:</p>
          <p className="code" style={{ userSelect: 'all', wordBreak: 'break-all' }}>{tempPw}</p>
        </div>
      )}

      {confirmAvatar && (
        <ConfirmModal danger title="Rimuovere la foto profilo?" confirmLabel="Rimuovi" text={`La foto di @${user.username} verrà eliminata.`}
          onConfirm={async () => { await adminRemoveAvatar(user.id); onChanged(); }} onClose={() => setConfirmAvatar(false)} />
      )}
      {confirmReset && (
        <ConfirmModal danger title="Resettare la password?" confirmLabel="Resetta"
          text={`Verrà generata una nuova password temporanea per @${user.username}, da comunicargli fuori dall'app.`}
          onConfirm={async () => { const pw = await adminResetPassword(user.id); setTempPw(pw); }} onClose={() => setConfirmReset(false)} />
      )}
    </Modal>
  );
}

function Users() {
  const users = useAsync(adminListProfiles, []);
  const [q, setQ] = useState('');
  const [manage, setManage] = useState<Profile | null>(null);
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
                {!u.is_superadmin && <Button size="sm" onClick={() => setManage(u)}>Gestisci</Button>}
              </span>
            </div>
          );
        })}
        {!list.length && <Empty title="Nessun utente" />}
      </div>
      {manage && <UserManageModal user={manage} onClose={() => setManage(null)} onChanged={async () => { await users.reload(); setManage(null); }} />}
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

function ReportDetail({ report, profiles, onClose, onChanged }:
  { report: Report; profiles: Record<string, Profile>; onClose: () => void; onChanged: () => void }) {
  const [chat, setChat] = useState<DirectMessage[] | null>(null);
  const reporter = profiles[report.reporter_id];
  const reported = profiles[report.reported_id];
  return (
    <Modal title={`Segnalazione #${report.id.slice(0, 8)}`} onClose={onClose}>
      <p className="small" style={{ margin: '0 0 4px' }}><b>Segnalato:</b> @{reported?.username ?? '?'}</p>
      <p className="small" style={{ margin: '0 0 4px' }}><b>Segnalatore:</b> @{reporter?.username ?? '?'}</p>
      <p className="small" style={{ margin: '0 0 4px' }}><b>Motivo:</b> {REASON_LABEL[report.reason]}</p>
      {report.description && <p className="small" style={{ margin: '0 0 4px' }}><b>Descrizione:</b> {report.description}</p>}
      <p className="small" style={{ margin: '0 0 4px' }}><b>Stato:</b> {STATUS_LABEL[report.status]}</p>

      <div className="row row-wrap" style={{ marginTop: 14 }}>
        {report.status === 'in_attesa' && <ActionButton size="sm" onAction={async () => { await adminTakeReport(report.id); onChanged(); }}>Prendi in carico</ActionButton>}
        {report.status !== 'risolta' && <ActionButton size="sm" variant="primary" onAction={async () => { await adminCloseReport(report.id, 'risolta'); onChanged(); }}>Chiudi (risolta)</ActionButton>}
        {report.status !== 'archiviata' && <ActionButton size="sm" onAction={async () => { await adminCloseReport(report.id, 'archiviata'); onChanged(); }}>Archivia</ActionButton>}
        <ActionButton size="sm" variant="danger"
          onAction={async () => { await adminSetBan(report.reported_id, new Date(Date.now() + 7 * 86_400_000).toISOString()); onChanged(); }}>Sospendi utente (7gg)</ActionButton>
        <ActionButton size="sm" variant="danger"
          onAction={async () => { await adminSetBan(report.reported_id, new Date(Date.now() + 365 * 86_400_000).toISOString()); onChanged(); }}>Blocca utente (1 anno)</ActionButton>
      </div>

      <div className="section-title"><h2>Chat tra i due utenti</h2></div>
      {chat === null ? (
        <ActionButton size="sm"
          onAction={async () => { setChat(await adminFindConversation(report.reporter_id, report.reported_id, `Gestione segnalazione #${report.id}`)); }}>
          Visualizza chat
        </ActionButton>
      ) : !chat.length ? <p className="muted small">Nessuna conversazione tra i due utenti.</p> : (
        <div className="stack">
          {chat.map(m => (
            <div key={m.id} className="card-flat small">
              <b>{profiles[m.author_id]?.username ?? '?'}</b>: {m.deleted_at ? <i>messaggio eliminato</i> : m.body}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Reports() {
  const [status, setStatus] = useState<ReportStatus>('in_attesa');
  const reports = useAsync(() => adminListReports(status), [status]);
  const users = useAsync(adminListProfiles, []);
  const [open, setOpen] = useState<Report | null>(null);
  const byId = Object.fromEntries((users.data ?? []).map(p => [p.id, p]));

  return (
    <>
      <div className="row row-wrap" style={{ marginBottom: 10 }}>
        {(Object.keys(STATUS_LABEL) as ReportStatus[]).map(s => (
          <Button key={s} size="sm" variant={status === s ? 'primary' : 'default'} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</Button>
        ))}
      </div>
      {reports.loading && !reports.data && <Loading />}
      {reports.error != null && <ErrorState error={reports.error} onRetry={reports.reload} />}
      {reports.data && !reports.data.length && <Empty title="Nessuna segnalazione" />}
      <div className="card">
        {reports.data?.map(r => (
          <button key={r.id} className="row between row-wrap" style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
            onClick={() => setOpen(r)}>
            <span><b>@{byId[r.reported_id]?.username ?? '?'}</b> · {REASON_LABEL[r.reason]}<div className="tiny muted">segnalato da @{byId[r.reporter_id]?.username ?? '?'} · {fmtDate(r.created_at)}</div></span>
            <span className="badge">{STATUS_LABEL[r.status]}</span>
          </button>
        ))}
      </div>
      {open && <ReportDetail report={open} profiles={byId} onClose={() => setOpen(null)} onChanged={async () => { await reports.reload(); setOpen(null); }} />}
    </>
  );
}

function PointsAndProfessors() {
  const leagues = useAsync(listMyLeagues, []);
  const [leagueId, setLeagueId] = useState('');
  const bundle = useAsync(() => loadLeagueBundle(leagueId), [leagueId], { enabled: !!leagueId });
  const [targetType, setTargetType] = useState<'professor' | 'team'>('professor');
  const [targetId, setTargetId] = useState('');
  const [delta, setDelta] = useState(10);
  const [reason, setReason] = useState('');
  const [teamForProf, setTeamForProf] = useState('');
  const [addProfId, setAddProfId] = useState('');

  return (
    <>
      <Field label="Lega"><Select value={leagueId} onChange={v => { setLeagueId(v); setTargetId(''); setTeamForProf(''); }} aria-label="Lega">
        <option value="">Scegli una lega</option>{leagues.data?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </Select></Field>
      {!leagueId && <Empty title="Scegli una lega">Seleziona una lega per gestire punti e professori delle squadre.</Empty>}
      {leagueId && bundle.loading && !bundle.data && <Loading />}
      {leagueId && bundle.error != null && <ErrorState error={bundle.error} onRetry={bundle.reload} />}
      {bundle.data && (
        <>
          <div className="section-title"><h2>Punti manuali</h2></div>
          <div className="card">
            <Field label="Tipo"><Select value={targetType} onChange={v => { setTargetType(v as 'professor' | 'team'); setTargetId(''); }} aria-label="Tipo">
              <option value="professor">Singolo prof</option><option value="team">Intera squadra</option>
            </Select></Field>
            <Field label={targetType === 'professor' ? 'Professore' : 'Squadra'}>
              <Select value={targetId} onChange={setTargetId} aria-label="Bersaglio">
                <option value="">Scegli</option>
                {(targetType === 'professor' ? bundle.data.professors : bundle.data.teams).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
            <Field label="Quantità" hint="Positivo per aggiungere, negativo per rimuovere">
              <input className="input" type="number" value={delta} onChange={e => setDelta(Number(e.target.value))} />
            </Field>
            <Field label="Motivo (facoltativo)" hint='Se vuoto, nel registro pubblico compare solo "Modifica manuale del Superadmin"'>
              <input className="input" maxLength={120} value={reason} onChange={e => setReason(e.target.value)} />
            </Field>
            <ActionButton variant="primary" disabled={!targetId || !delta} okMessage="Punti aggiornati"
              onAction={async () => { await adminAdjustPoints(targetType, targetId, delta, reason.trim()); setReason(''); }}>Conferma</ActionButton>
          </div>

          <div className="section-title"><h2>Gestione prof nelle squadre</h2></div>
          <div className="card">
            <Field label="Squadra"><Select value={teamForProf} onChange={setTeamForProf} aria-label="Squadra per gestione prof">
              <option value="">Scegli una squadra</option>{bundle.data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select></Field>
            {teamForProf && (() => {
              const teamProfIds = new Set(bundle.data!.teamProfessors.filter(tp => tp.team_id === teamForProf).map(tp => tp.professor_id));
              const current = bundle.data!.professors.filter(p => teamProfIds.has(p.id));
              const available = bundle.data!.professors.filter(p => !teamProfIds.has(p.id));
              return (
                <>
                  <div className="row row-wrap" style={{ marginBottom: 10 }}>
                    {current.map(p => (
                      <span key={p.id} className="badge row" style={{ gap: 6 }}>{p.name}
                        <ActionButton size="sm" variant="ghost" onAction={async () => { await adminRemoveTeamProfessor(teamForProf, p.id); await bundle.reload(); }}>✕</ActionButton>
                      </span>
                    ))}
                    {!current.length && <span className="muted small">Nessun professore in squadra.</span>}
                  </div>
                  <div className="row row-wrap">
                    <Select value={addProfId} onChange={setAddProfId} aria-label="Aggiungi professore">
                      <option value="">Aggiungi professore…</option>{available.map(p => <option key={p.id} value={p.id}>{p.name} ({p.cost})</option>)}
                    </Select>
                    <ActionButton disabled={!addProfId} okMessage="Professore aggiunto"
                      onAction={async () => { await adminAddTeamProfessor(teamForProf, addProfId); setAddProfId(''); await bundle.reload(); }}>Aggiungi</ActionButton>
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
    </>
  );
}

function Audit() {
  const logs = useAsync(() => adminListAudit(150), []);
  const users = useAsync(adminListProfiles, []);
  const byId = Object.fromEntries((users.data ?? []).map(p => [p.id, p.username]));
  if (logs.loading && !logs.data) return <Loading />;
  if (logs.error != null) return <ErrorState error={logs.error} onRetry={logs.reload} />;
  return (
    <div className="card">
      {logs.data?.map(l => (
        <div key={l.id} className="row between row-wrap" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
          <span className="small">
            <b>{byId[l.admin_id ?? ''] ?? 'Sistema'}</b> · {l.action}{l.target_type ? ` · ${l.target_type}` : ''}{l.reason ? ` · "${l.reason}"` : ''}
          </span>
          <span className="tiny muted">{fmtDateTime(l.created_at)}</span>
        </div>
      ))}
      {logs.data && !logs.data.length && <Empty title="Nessuna voce" />}
    </div>
  );
}

function System() {
  const mode = useAsync(() => getSetting<string>('app_mode', 'normal'), []);
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
      {tab === 'utenti' && <Users />}{tab === 'leghe' && <Leagues />}{tab === 'codici' && <Codes />}{tab === 'news' && <NewsAdmin />}
      {tab === 'segnalazioni' && <Reports />}{tab === 'punti' && <PointsAndProfessors />}{tab === 'audit' && <Audit />}{tab === 'sistema' && <System />}
    </main>
  );
}
