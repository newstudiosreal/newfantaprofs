import { useEffect, useState } from 'react';
import { ActionButton, Button, Empty, ErrorState, Field, Loading, Modal } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { adminListProfiles } from '@/lib/api';
import {
  adminGetTokenConfig, adminListBadgeRequests, adminListTokenFinds, adminReviewBadge, adminSetTokenConfig, adminTokenStats,
} from '@/lib/api.token';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { BADGE_TEXT_MAX, badgeTextError, configError, findStatusLabel, REQUEST_STATUS_LABEL, REWARD_DEFS, REWARD_GROUPS, rewardLabel } from '@/lib/token';
import type { TokenBadgeRequest, TokenConfig } from '@/lib/types.token';

function Stat({ value, label }: { value: string | number; label: string }) {
  return <div className="card tk-stat"><div className="score">{value}<small>{label}</small></div></div>;
}

function Config({ onSaved }: { onSaved: () => void }) {
  const cfg = useAsync(adminGetTokenConfig, []);
  const [draft, setDraft] = useState<TokenConfig | null>(null);
  useEffect(() => { if (cfg.data) setDraft(cfg.data); }, [cfg.data]);
  if (cfg.loading && !cfg.data) return <Loading rows={2} />;
  if (cfg.error != null) return <ErrorState error={cfg.error} onRetry={cfg.reload} />;
  if (!cfg.data || !draft) return null;
  const saved = cfg.data;
  const err = configError(draft);
  const dirty = JSON.stringify({ ...draft, eligible: [...draft.eligible].sort() }) !== JSON.stringify({ ...saved, eligible: [...saved.eligible].sort() });
  const toggleKey = (k: string) => setDraft({ ...draft, eligible: draft.eligible.includes(k) ? draft.eligible.filter(x => x !== k) : [...draft.eligible, k] });
  const save = async (c: TokenConfig) => { await adminSetTokenConfig(c); await cfg.reload(); onSaved(); };

  return (
    <div className="card">
      <div className="row between row-wrap">
        <div><h3>Sistema {saved.enabled ? 'attivo' : 'spento'}</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Da spento nessun accesso viene conteggiato e nessun Token viene assegnato. I Token già trovati restano riscattabili.</p></div>
        <ActionButton variant={saved.enabled ? 'danger' : 'primary'} okMessage={saved.enabled ? 'Sistema disattivato' : 'Sistema attivato'}
          onAction={() => save({ ...saved, enabled: !saved.enabled })}>{saved.enabled ? 'Disattiva' : 'Attiva'}</ActionButton>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <Field label="Probabilità (%)" hint="Chance di trovare il Token a ogni controllo">
          <input className="input" type="number" min={0} max={100} step={0.1} value={Number.isNaN(draft.probability) ? '' : draft.probability}
            onChange={e => setDraft({ ...draft, probability: e.target.value === '' ? Number.NaN : Number(e.target.value) })} />
        </Field>
        <Field label="Accessi validi per controllo" hint="Ogni N accessi validi si tira il dado">
          <input className="input" type="number" min={1} max={1000} step={1} value={Number.isNaN(draft.visits_required) ? '' : draft.visits_required}
            onChange={e => setDraft({ ...draft, visits_required: e.target.value === '' ? Number.NaN : Number(e.target.value) })} />
        </Field>
        <Field label="Minuti tra due accessi validi" hint="Refresh e ricaricamenti più ravvicinati non contano (0 = ogni apertura conta)">
          <input className="input" type="number" min={0} max={1440} step={1} value={Number.isNaN(draft.min_gap_minutes) ? '' : draft.min_gap_minutes}
            onChange={e => setDraft({ ...draft, min_gap_minutes: e.target.value === '' ? Number.NaN : Number(e.target.value) })} />
        </Field>
      </div>

      <div className="section-title"><h2>Premi disponibili con il Token</h2></div>
      <p className="muted small" style={{ marginTop: 0 }}>Sono gli stessi prodotti di Codici. L'utente vede solo quelli spuntati che non possiede già.</p>
      {REWARD_GROUPS.map(g => (
        <div key={g.id} className="tk-group">
          <h4>{g.label}</h4>
          <div className="row row-wrap">
            {REWARD_DEFS.filter(r => r.group === g.id).map(r => (
              <label key={r.key} className="row badge" style={{ gap: 6, cursor: 'pointer', padding: '6px 10px' }}>
                <input type="checkbox" checked={draft.eligible.includes(r.key)} onChange={() => toggleKey(r.key)} /> {r.emoji} {r.name}
              </label>
            ))}
          </div>
        </div>
      ))}

      {err && <p className="small" style={{ color: 'var(--neg)', marginTop: 12 }}>{err}</p>}
      <div className="row" style={{ marginTop: 16 }}>
        <ActionButton variant="primary" disabled={!!err || !dirty} okMessage="Impostazioni salvate" onAction={() => save(draft)}>Salva impostazioni</ActionButton>
        {dirty && <Button variant="ghost" onClick={() => setDraft(saved)}>Annulla modifiche</Button>}
      </div>
    </div>
  );
}

function ReviewModal({ req, username, onClose, onDone }: { req: TokenBadgeRequest; username: string; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState(req.text);
  const [note, setNote] = useState('');
  const edited = text.trim() !== req.text;
  return (
    <Modal title={`Badge di @${username}`} onClose={onClose}>
      <p className="small" style={{ margin: '0 0 4px' }}><b>Richiesto:</b> «{req.text}»</p>
      {req.description && <p className="small" style={{ margin: '0 0 8px' }}><b>Descrizione:</b> {req.description}</p>}
      <Field label="Testo finale" hint="Puoi modificarlo: verrà assegnato questo"><input className="input" maxLength={BADGE_TEXT_MAX} value={text} onChange={e => setText(e.target.value)} /></Field>
      <Field label="Messaggio per l'utente (facoltativo)" hint="Lo vede nello stato della richiesta, soprattutto se rifiuti"><input className="input" maxLength={200} value={note} onChange={e => setNote(e.target.value)} /></Field>
      {badgeTextError(text) && <p className="small" style={{ color: 'var(--neg)' }}>{badgeTextError(text)}</p>}
      <div className="row row-wrap" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <ActionButton variant="danger" okMessage="Richiesta rifiutata: il Token è tornato all'utente" onAction={async () => { await adminReviewBadge(req.id, false, null, note); onDone(); }}>Rifiuta</ActionButton>
        <ActionButton variant="primary" disabled={!!badgeTextError(text)} okMessage="Badge assegnato"
          onAction={async () => { await adminReviewBadge(req.id, true, edited ? text.trim() : null, note); onDone(); }}>{edited ? 'Modifica e approva' : 'Approva'}</ActionButton>
      </div>
    </Modal>
  );
}

type Filter = 'tutti' | 'aperti' | 'riscattati';

export default function SuperAdminToken() {
  const stats = useAsync(adminTokenStats, [], { interval: 60_000 });
  const finds = useAsync(adminListTokenFinds, []);
  const reqs = useAsync(adminListBadgeRequests, []);
  const users = useAsync(adminListProfiles, []);
  const [filter, setFilter] = useState<Filter>('tutti');
  const [review, setReview] = useState<TokenBadgeRequest | null>(null);
  const name = (id: string) => users.data?.find(u => u.id === id)?.username ?? '?';
  const reloadAll = async () => { await Promise.all([stats.reload(), finds.reload(), reqs.reload()]); };

  const list = (finds.data ?? []).filter(f => filter === 'tutti' || (filter === 'riscattati' ? f.status === 'redeemed' : f.status !== 'redeemed'));
  const pending = (reqs.data ?? []).filter(r => r.status === 'pending');
  const done = (reqs.data ?? []).filter(r => r.status !== 'pending');
  const perUser = Object.entries((finds.data ?? []).reduce<Record<string, number>>((m, f) => { m[f.user_id] = (m[f.user_id] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const s = stats.data;
  const hit = s && s.checks > 0 ? `${((s.finds / s.checks) * 100).toFixed(1)}%` : '—';

  return (
    <div className="stack">
      <Config onSaved={reloadAll} />

      <div className="section-title"><h2>Statistiche</h2></div>
      {stats.loading && !s && <Loading rows={1} />}
      {stats.error != null && <ErrorState error={stats.error} onRetry={stats.reload} />}
      {s && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            <Stat value={s.finds} label="TROVATI" /><Stat value={s.open + s.badge_pending} label="DA RISCATTARE" /><Stat value={s.redeemed} label="RISCATTATI" />
            <Stat value={s.users_with} label="UTENTI" /><Stat value={s.requests_pending} label="BADGE IN ATTESA" />
            <Stat value={s.valid_visits} label="ACCESSI VALIDI" /><Stat value={s.checks} label="CONTROLLI" /><Stat value={hit} label="RESA EFFETTIVA" />
          </div>
          {Object.keys(s.by_reward).length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ marginBottom: 8 }}>Premi scelti</h3>
              <div className="row row-wrap">{Object.entries(s.by_reward).sort((a, b) => b[1] - a[1]).map(([k, n]) => <span key={k} className="badge">{rewardLabel(k)} × {n}</span>)}</div>
            </div>
          )}
        </>
      )}

      <div className="section-title"><h2>Richieste badge personalizzati</h2></div>
      {reqs.loading && !reqs.data && <Loading rows={1} />}
      {reqs.error != null && <ErrorState error={reqs.error} onRetry={reqs.reload} />}
      {reqs.data && !pending.length && <Empty title="Nessuna richiesta in attesa" />}
      {!!pending.length && (
        <div className="card">
          {pending.map(r => (
            <div key={r.id} className="row between row-wrap" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <span><b>«{r.text}»</b> <span className="muted small">di @{name(r.user_id)}</span>
                {r.description && <div className="small muted">{r.description}</div>}<div className="tiny muted">{fmtDateTime(r.created_at)}</div></span>
              <Button size="sm" variant="primary" onClick={() => setReview(r)}>Gestisci</Button>
            </div>
          ))}
        </div>
      )}
      {!!done.length && (
        <details className="card" style={{ marginTop: 12 }}>
          <summary className="bold">Richieste già gestite ({done.length})</summary>
          {done.map(r => (
            <div key={r.id} className="row between row-wrap small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span>@{name(r.user_id)} · «{r.text}»{r.final_text && r.final_text !== r.text ? ` → «${r.final_text}»` : ''}{r.admin_note ? ` · ${r.admin_note}` : ''}</span>
              <span className="badge">{REQUEST_STATUS_LABEL[r.status]}</span>
            </div>
          ))}
        </details>
      )}

      <div className="section-title"><h2>Storico ritrovamenti e premi</h2></div>
      <div className="row row-wrap" style={{ marginBottom: 10 }}>
        {(['tutti', 'aperti', 'riscattati'] as Filter[]).map(f => <Button key={f} size="sm" variant={filter === f ? 'primary' : 'default'} onClick={() => setFilter(f)}>{f === 'tutti' ? 'Tutti' : f === 'aperti' ? 'Da riscattare' : 'Riscattati'}</Button>)}
      </div>
      {finds.loading && !finds.data && <Loading />}
      {finds.error != null && <ErrorState error={finds.error} onRetry={finds.reload} />}
      <div className="card">
        {list.map(f => (
          <div key={f.id} className="row between row-wrap" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span><b>@{name(f.user_id)}</b><div className="tiny muted">trovato il {fmtDateTime(f.found_at)} · prob. {f.probability}%{f.redeemed_at ? ` · riscattato il ${fmtDate(f.redeemed_at)}` : ''}</div></span>
            <span className={f.status === 'redeemed' ? 'badge badge-pos' : 'badge badge-accent'}>{findStatusLabel(f)}</span>
          </div>
        ))}
        {finds.data && !list.length && <Empty title="Nessun ritrovamento" />}
      </div>

      {!!perUser.length && (
        <>
          <div className="section-title"><h2>Utenti che hanno trovato un Token</h2></div>
          <div className="card row row-wrap">{perUser.map(([id, n]) => <span key={id} className="badge">@{name(id)} × {n}</span>)}</div>
        </>
      )}

      {review && <ReviewModal req={review} username={name(review.user_id)} onClose={() => setReview(null)} onDone={async () => { setReview(null); await reloadAll(); }} />}
    </div>
  );
}
