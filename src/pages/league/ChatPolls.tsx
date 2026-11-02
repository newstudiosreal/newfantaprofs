import { useState } from 'react';
import { ActionButton, Button, Field, Modal, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useRealtime } from '@/hooks/useRealtime';
import { createPoll, deletePoll, listPolls, votePoll } from '@/lib/api.social';
import { timeLeft } from '@/lib/format';
import type { LeaguePoll } from '@/lib/types.social';
import { useLeague } from './context';

function PollCard({ poll, onChanged }: { poll: LeaguePoll; onChanged: () => Promise<unknown> }) {
  const { meId, isAdmin, userById } = useLeague();
  const open = new Date(poll.closes_at).getTime() > Date.now();
  const canVote = open && poll.my_vote === null;
  const best = Math.max(...poll.counts);
  return (
    <div className="card poll">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <b>{poll.question}</b>
          <div className="muted tiny">{userById(poll.author_id)?.username ?? '?'} · {open ? `chiude tra ${timeLeft(poll.closes_at)}` : 'chiuso'} · {poll.total} {poll.total === 1 ? 'voto' : 'voti'}</div>
        </div>
        {(poll.author_id === meId || isAdmin) && (
          <ActionButton size="sm" variant="ghost" aria-label="Elimina sondaggio" onAction={async () => { await deletePoll(poll.id); await onChanged(); }}>✕</ActionButton>
        )}
      </div>
      <div className="stack" style={{ marginTop: 10, gap: 6 }}>
        {poll.options.map((o, i) => {
          const n = poll.counts[i] ?? 0;
          const pct = poll.total ? Math.round((n / poll.total) * 100) : 0;
          const mine = poll.my_vote === i;
          return (
            <button key={i} type="button" className={`poll-opt ${mine ? 'mine' : ''} ${!open && n === best && n > 0 ? 'win' : ''}`} disabled={!canVote}
              aria-label={`${o}: ${pct}% (${n})${mine ? ', il tuo voto' : ''}`}
              onClick={async () => { try { await votePoll(poll.id, i); await onChanged(); } catch (e) { await onChanged(); throw e; } }}>
              <i className="poll-bar" style={{ width: `${canVote ? 0 : pct}%` }} />
              <span className="poll-label">{mine ? '✓ ' : ''}{o}</span>
              {!canVote && <span className="poll-pct">{pct}%</span>}
            </button>
          );
        })}
      </div>
      {canVote && <p className="hint">Il voto non si può cambiare. I risultati compaiono dopo che hai votato.</p>}
    </div>
  );
}

function NewPoll({ leagueId, onClose, onCreated }: { leagueId: string; onClose: () => void; onCreated: () => Promise<unknown> }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [hours, setHours] = useState('24');
  const clean = opts.map(o => o.trim()).filter(Boolean);
  const valid = q.trim().length >= 2 && clean.length >= 2 && new Set(clean.map(o => o.toLowerCase())).size === clean.length;
  return (
    <Modal title="Nuovo sondaggio" onClose={onClose}>
      <Field label="Domanda"><input className="input" value={q} maxLength={120} onChange={e => setQ(e.target.value)} placeholder="Es. Chi farà più punti domani?" /></Field>
      {opts.map((o, i) => (
        <Field key={i} label={`Opzione ${i + 1}`}>
          <div className="row">
            <input className="input" value={o} maxLength={40} onChange={e => setOpts(list => list.map((x, j) => (j === i ? e.target.value : x)))} />
            {opts.length > 2 && <Button size="sm" variant="ghost" aria-label={`Rimuovi opzione ${i + 1}`} onClick={() => setOpts(list => list.filter((_, j) => j !== i))}>✕</Button>}
          </div>
        </Field>
      ))}
      {opts.length < 5 && <Button size="sm" onClick={() => setOpts(l => [...l, ''])}>+ Aggiungi opzione</Button>}
      <Field label="Durata"><Select value={hours} onChange={setHours} aria-label="Durata">
        <option value="1">1 ora</option><option value="6">6 ore</option><option value="24">24 ore</option><option value="72">3 giorni</option></Select></Field>
      <ActionButton variant="primary" block disabled={!valid} okMessage="Sondaggio creato"
        onAction={async () => { await createPoll(leagueId, q.trim(), clean, Number(hours)); await onCreated(); onClose(); }}>Pubblica sondaggio</ActionButton>
    </Modal>
  );
}

/** Sondaggi rapidi della lega, mostrati sopra la chat. */
export function ChatPolls() {
  const { bundle } = useLeague();
  const leagueId = bundle.league.id;
  const { data, reload } = useAsync(() => listPolls(leagueId), [leagueId], { interval: 120_000 });
  useRealtime([{ table: 'polls', filter: `league_id=eq.${leagueId}` }, 'poll_votes'], { onChange: () => { void reload(); } });
  const [creating, setCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const now = Date.now();
  const polls = (data ?? []).filter(p => showClosed || new Date(p.closes_at).getTime() > now);
  const closedCount = (data ?? []).length - (data ?? []).filter(p => new Date(p.closes_at).getTime() > now).length;

  return (
    <section aria-label="Sondaggi" style={{ marginBottom: 14 }}>
      <div className="row between row-wrap">
        <b>📊 Sondaggi</b>
        <span className="row">
          {closedCount > 0 && <Button size="sm" variant="ghost" onClick={() => setShowClosed(s => !s)}>{showClosed ? 'Nascondi chiusi' : `Chiusi (${closedCount})`}</Button>}
          <Button size="sm" onClick={() => setCreating(true)}>+ Nuovo</Button>
        </span>
      </div>
      <div className="stack" style={{ marginTop: 8 }}>
        {polls.map(p => <PollCard key={p.id} poll={p} onChanged={reload} />)}
        {data && !polls.length && <p className="muted small" style={{ margin: 0 }}>Nessun sondaggio aperto. Creane uno per decidere insieme alla lega.</p>}
      </div>
      {creating && <NewPoll leagueId={leagueId} onClose={() => setCreating(false)} onCreated={reload} />}
    </section>
  );
}
