import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ActionButton, Avatar, Button, Empty, ErrorState, Loading } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { deleteMessage, listMessages, sendMessage } from '@/lib/api';
import { explain } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { useLeague } from './context';

export const chatSeenKey = (leagueId: string) => `fp_chat_seen_${leagueId}`;

export function Chat() {
  const { bundle, meId, isAdmin, userById } = useLeague();
  const leagueId = bundle.league.id;
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => listMessages(leagueId), [leagueId], { interval: 6_000 });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = data ? [...data].reverse() : [];

  useEffect(() => {
    try { localStorage.setItem(chatSeenKey(leagueId), String(Date.now())); } catch { /* ignora */ }
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [leagueId, data?.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try { await sendMessage(leagueId, body); setText(''); await reload(); }
    catch (err) { toast.error(explain(err)); }
    finally { setSending(false); }
  };

  return (
    <>
      {loading && !data && <Loading />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !messages.length && <Empty title="Chat vuota">Scrivi il primo messaggio alla lega.</Empty>}
      <div className="chat" aria-live="polite">
        {messages.map(m => {
          const mine = m.author_id === meId; const author = userById(m.author_id);
          return (
            <div key={m.id} className={`bubble ${mine ? 'mine' : ''}`}>
              <div className="row" style={{ gap: 6 }}>{!mine && <Avatar profile={author} />}<span className="who">{mine ? 'Tu' : author?.username ?? '?'} · {timeAgo(m.created_at)}</span></div>
              <div>{m.body}</div>
              {(mine || isAdmin) && <ActionButton size="sm" variant="ghost" onAction={async () => { await deleteMessage(m.id); await reload(); }}>Elimina</ActionButton>}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input className="input" value={text} maxLength={500} onChange={e => setText(e.target.value)} placeholder="Scrivi alla lega…" aria-label="Messaggio" />
        <Button type="submit" variant="primary" disabled={!text.trim() || sending}>Invia</Button>
      </form>
    </>
  );
}
