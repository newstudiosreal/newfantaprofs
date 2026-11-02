import { useState } from 'react';
import { ActionButton, Empty, ErrorState, Field, Loading } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import {
  adminAddBannedWord, adminDeleteClientError, adminListBannedWords, adminListClientErrors, adminRemoveBannedWord,
} from '@/lib/api.social';
import { fmtDateTime } from '@/lib/format';

export function BannedWords() {
  const list = useAsync(adminListBannedWords, []);
  const [word, setWord] = useState('');
  return (
    <div className="stack">
      <div className="card">
        <h3>Parole vietate</h3>
        <p className="muted small">Chat di lega, messaggi privati, sondaggi e proposte rifiutano i testi che contengono queste parole (intere, senza distinguere maiuscole, accenti o numeri tipo «p1rla»). La lista parte vuota: la gestisci tu.</p>
        <Field label="Nuova parola"><input className="input" value={word} maxLength={40} onChange={e => setWord(e.target.value)} /></Field>
        <ActionButton variant="primary" disabled={word.trim().length < 2} okMessage="Parola aggiunta"
          onAction={async () => { await adminAddBannedWord(word); setWord(''); await list.reload(); }}>Aggiungi</ActionButton>
      </div>
      {list.loading && !list.data && <Loading rows={1} />}
      {list.error != null && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data && !list.data.length && <Empty title="Nessuna parola vietata" />}
      {list.data && list.data.length > 0 && (
        <div className="card row row-wrap">
          {list.data.map(w => (
            <span key={w.word} className="badge">{w.word}
              <ActionButton size="sm" variant="ghost" aria-label={`Rimuovi ${w.word}`} onAction={async () => { await adminRemoveBannedWord(w.word); await list.reload(); }}>✕</ActionButton></span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClientErrors() {
  const list = useAsync(() => adminListClientErrors(150), []);
  const [open, setOpen] = useState<string | null>(null);
  if (list.loading && !list.data) return <Loading />;
  if (list.error != null) return <ErrorState error={list.error} onRetry={list.reload} />;
  return (
    <div className="stack">
      {list.data && !list.data.length && <Empty title="Nessun errore segnalato">Gli utenti possono segnalare i problemi dalla schermata di errore.</Empty>}
      {list.data?.map(e => (
        <div key={e.id} className="card">
          <div className="row between row-wrap">
            <b className="small" style={{ wordBreak: 'break-word' }}>{e.message}</b>
            <span className="tiny muted">{fmtDateTime(e.created_at)}</span>
          </div>
          <div className="tiny muted" style={{ wordBreak: 'break-all' }}>{e.username ? `@${e.username}` : 'utente rimosso'} · {e.url ?? '—'}</div>
          <div className="row row-wrap" style={{ marginTop: 6 }}>
            {e.stack && <button type="button" className="btn btn-sm btn-ghost" aria-expanded={open === e.id} onClick={() => setOpen(o => (o === e.id ? null : e.id))}>{open === e.id ? 'Nascondi dettagli' : 'Dettagli'}</button>}
            <ActionButton size="sm" variant="danger" onAction={async () => { await adminDeleteClientError(e.id); await list.reload(); }}>Elimina</ActionButton>
          </div>
          {open === e.id && <pre className="err-stack">{e.stack}{e.user_agent ? `\n\n${e.user_agent}` : ''}</pre>}
        </div>
      ))}
    </div>
  );
}
