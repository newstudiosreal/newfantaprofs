import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ActionButton, Avatar, Empty, ErrorState, Loading, VerifiedMark } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { deleteDmMessage, getConversationPeer, listDmMessages, markConversationRead, sendDm } from '@/lib/api';
import { explain } from '@/lib/errors';
import { timeAgo } from '@/lib/format';

export function Thread() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const meId = profile!.id;
  const nav = useNavigate();
  const toast = useToast();
  const peer = useAsync(() => getConversationPeer(id, meId), [id, meId], { interval: 20_000 });
  const { data, error, loading, reload } = useAsync(() => listDmMessages(id), [id], { interval: 5_000 });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void markConversationRead(id); }, [id, data?.length]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [data?.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try { await sendDm(id, body); setText(''); await reload(); }
    catch (err) { toast.error(explain(err)); }
    finally { setSending(false); }
  };

  const blocked = peer.data && !peer.data.can_message;

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <ActionButton size="sm" variant="ghost" onAction={async () => { nav('/community/messaggi'); }}>← Indietro</ActionButton>
        {peer.data && (
          <Link to={`/profilo/${peer.data.username}`} className="row grow" style={{ textDecoration: 'none', minWidth: 0 }}>
            <Avatar profile={peer.data} />
            <span className="row" style={{ minWidth: 0 }}><b className="ellipsis">{peer.data.username}</b><VerifiedMark profile={peer.data} /></span>
            {peer.data.online && <span className="muted tiny">🟢 Online</span>}
          </Link>
        )}
      </div>

      {loading && !data && <Loading />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !data.length && <Empty title="Nessun messaggio">Scrivi il primo messaggio.</Empty>}
      <div className="chat" aria-live="polite">
        {data?.map(m => {
          const mine = m.author_id === meId;
          return (
            <div key={m.id} className={`bubble ${mine ? 'mine' : ''}`}>
              <div className="who">{mine ? 'Tu' : peer.data?.username ?? '…'} · {timeAgo(m.created_at)}</div>
              <div>{m.deleted_at ? <i className="muted">Messaggio eliminato</i> : m.body}</div>
              {mine && !m.deleted_at && (
                <ActionButton size="sm" variant="ghost" onAction={async () => { await deleteDmMessage(m.id); await reload(); }}>Elimina</ActionButton>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {blocked ? (
        <p className="muted small" style={{ marginTop: 10 }}>Non puoi scrivere a questo utente.</p>
      ) : (
        <form className="chat-form" onSubmit={submit}>
          <div className="chat-input-wrap">
            <input className="input" value={text} maxLength={1000} onChange={e => setText(e.target.value)}
              placeholder="Scrivi un messaggio…" aria-label="Messaggio" autoComplete="off" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!text.trim() || sending}>Invia</button>
        </form>
      )}
    </>
  );
}
