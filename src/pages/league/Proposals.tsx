import { useState } from 'react';
import { ActionButton, Empty, ErrorState, Field, Loading, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useRealtime } from '@/hooks/useRealtime';
import { listProposals, proposeEvent, reviewProposal } from '@/lib/api.social';
import { timeAgo } from '@/lib/format';
import type { CatalogEvent } from '@/lib/types';
import type { EventProposal, ProposalStatus } from '@/lib/types.social';
import { useLeague } from './context';

const STATUS: Record<ProposalStatus, { label: string; cls: string }> = {
  pending: { label: 'In attesa', cls: 'badge' },
  approved: { label: 'Approvata', cls: 'badge badge-pos' },
  rejected: { label: 'Rifiutata', cls: 'badge badge-neg' },
};

export function Proposals() {
  const { bundle, can, meId, profById, userById } = useLeague();
  const { league, professors } = bundle;
  const { data, error, loading, reload } = useAsync(() => listProposals(league.id), [league.id], { interval: 120_000 });
  useRealtime([{ table: 'event_proposals', filter: `league_id=eq.${league.id}` }], { onChange: () => { void reload(); } });
  const [prof, setProf] = useState('');
  const [ev, setEv] = useState('');
  const [note, setNote] = useState('');
  const reviewer = can('events');

  const catalog: CatalogEvent[] = [...league.bonus, ...league.malus, ...league.premi];
  const evLabel = (key: string) => catalog.find(e => e.id === key);
  const mine = (data ?? []).filter(p => p.proposer_id === meId);
  const queue = (data ?? []).filter(p => p.status === 'pending' && p.proposer_id !== meId);
  const pendingMine = mine.filter(p => p.status === 'pending').length;

  const line = (p: EventProposal) => {
    const e = evLabel(p.event_key);
    return (
      <span style={{ minWidth: 0 }}>
        <b className="ellipsis" style={{ display: 'block' }}>{profById(p.professor_id)?.name ?? '?'} · {e?.label ?? p.event_key}
          {e && <span className={`pts ${e.pts > 0 ? 'pos' : 'neg'}`} style={{ marginLeft: 6 }}>{e.pts > 0 ? `+${e.pts}` : e.pts}</span>}</b>
        {p.note && <span className="muted small" style={{ display: 'block' }}>“{p.note}”</span>}
        <span className="muted tiny">{userById(p.proposer_id)?.username ?? '?'} · {timeAgo(p.created_at)}</span>
      </span>
    );
  };

  const group = (title: string, items: CatalogEvent[]) => items.length > 0 && (
    <optgroup label={title}>{items.map(e => <option key={e.id} value={e.id}>{e.label} ({e.pts > 0 ? `+${e.pts}` : e.pts})</option>)}</optgroup>
  );

  return (
    <>
      {reviewer && (
        <>
          <div className="section-title" style={{ marginTop: 0 }}><h2>Da valutare</h2>{queue.length > 0 && <span className="badge badge-accent">{queue.length}</span>}</div>
          {!queue.length && !loading && <Empty title="Nessuna proposta in coda">Quando un giocatore segnala un evento lo trovi qui.</Empty>}
          <div className="stack">
            {queue.map(p => (
              <div key={p.id} className="card row between row-wrap">
                {line(p)}
                <span className="row">
                  <ActionButton size="sm" variant="primary" okMessage="Approvata: punti assegnati" onAction={async () => { await reviewProposal(p.id, true); await reload(); }}>Approva</ActionButton>
                  <ActionButton size="sm" variant="danger" onAction={async () => { await reviewProposal(p.id, false); await reload(); }}>Rifiuta</ActionButton>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title" style={reviewer ? undefined : { marginTop: 0 }}><h2>Proponi un evento</h2></div>
      <div className="card">
        <p className="muted small" style={{ marginTop: 0 }}>Hai visto qualcosa in classe? Segnalalo: se l'admin lo approva i punti vengono assegnati al professore. Massimo 5 proposte in attesa ({pendingMine}/5).</p>
        {!professors.length ? <Empty title="Nessun professore">L'admin deve ancora aggiungere i professori.</Empty> : (
          <>
            <Field label="Professore"><Select value={prof} onChange={setProf} aria-label="Professore">
              <option value="">Scegli</option>{professors.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Cosa è successo?"><Select value={ev} onChange={setEv} aria-label="Evento">
              <option value="">Scegli</option>{group('Bonus', league.bonus)}{group('Malus', league.malus)}{group('Premi speciali', league.premi)}</Select></Field>
            <Field label="Nota (facoltativa)" hint="Es. «oggi in 3B, seconda ora». Massimo 140 caratteri."><input className="input" value={note} maxLength={140} onChange={e => setNote(e.target.value)} /></Field>
            <ActionButton variant="primary" block disabled={!prof || !ev || pendingMine >= 5} okMessage="Proposta inviata"
              onAction={async () => { await proposeEvent(league.id, prof, ev, note.trim()); setNote(''); setEv(''); await reload(); }}>Invia proposta</ActionButton>
          </>
        )}
      </div>

      <div className="section-title"><h2>Le mie proposte</h2></div>
      {loading && !data && <Loading rows={2} />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !mine.length && <Empty title="Nessuna proposta">Le tue segnalazioni compariranno qui con il loro stato.</Empty>}
      <div className="stack">
        {mine.map(p => (
          <div key={p.id} className="card row between row-wrap">{line(p)}<span className={STATUS[p.status].cls}>{STATUS[p.status].label}</span></div>
        ))}
      </div>
    </>
  );
}
