import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionButton, Avatar, Button, Empty, ErrorState, Loading, VerifiedMark } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { deleteMessage, listMessages, sendMessage } from '@/lib/api';
import { explain } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { activeMentionQuery, applyMention, mentionsUser, renderWithMentions } from '@/lib/mentions';
import { useLeague } from './context';

export const chatSeenKey = (leagueId: string) => `fp_chat_seen_${leagueId}`;

export function Chat() {
  const { bundle, meId, isAdmin, userById } = useLeague();
  const leagueId = bundle.league.id;
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => listMessages(leagueId), [leagueId], { interval: 6_000 });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messages = data ? [...data].reverse() : [];
  const me = userById(meId);

  const members = useMemo(() => Object.values(bundle.profiles).sort((a, b) => a.username.localeCompare(b.username)), [bundle.profiles]);
  const usernameSet = useMemo(() => new Set(members.map(m => m.username.toLowerCase())), [members]);
  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members.filter(m => m.username.toLowerCase().startsWith(q)).slice(0, 6);
  }, [mention, members]);

  useEffect(() => {
    try { localStorage.setItem(chatSeenKey(leagueId), String(Date.now())); } catch { /* ignora */ }
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [leagueId, data?.length]);

  useEffect(() => { setActiveIdx(0); }, [mention?.query]);

  const onChangeText = (value: string, caret: number) => {
    setText(value);
    setMention(activeMentionQuery(value, caret));
  };

  const pickMention = (username: string) => {
    if (!mention || !inputRef.current) return;
    const caret = inputRef.current.selectionStart ?? text.length;
    const { text: nextText, caret: nextCaret } = applyMention(text, mention.start, caret, username);
    setText(nextText);
    setMention(null);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(nextCaret, nextCaret); });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter' && mention) { e.preventDefault(); pickMention(suggestions[activeIdx].username); }
    else if (e.key === 'Escape') setMention(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try { await sendMessage(leagueId, body); setText(''); setMention(null); await reload(); }
    catch (err) { toast.error(explain(err)); }
    finally { setSending(false); }
  };

  return (
    <>
      {loading && !data && <Loading />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !messages.length && <Empty title="Chat vuota">Scrivi il primo messaggio alla lega. Usa @ per citare un compagno di lega.</Empty>}
      <div className="chat" aria-live="polite">
        {messages.map(m => {
          const mine = m.author_id === meId; const author = userById(m.author_id);
          const mentioned = !mine && !!me?.username && mentionsUser(m.body, me.username);
          return (
            <div key={m.id} className={`bubble ${mine ? 'mine' : ''} ${mentioned ? 'mentioned' : ''}`}>
              <div className="row" style={{ gap: 6 }}>{!mine && <Avatar profile={author} />}
                <span className="who">{mine ? 'Tu' : author?.username ?? '?'} <VerifiedMark profile={author} /> · {timeAgo(m.created_at)}</span></div>
              <div>{renderWithMentions(m.body, u => usernameSet.has(u.toLowerCase()), u => nav(`/profilo/${u}`))}</div>
              {(mine || isAdmin) && <ActionButton size="sm" variant="ghost" onAction={async () => { await deleteMessage(m.id); await reload(); }}>Elimina</ActionButton>}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="chat-form" onSubmit={submit}>
        <div className="chat-input-wrap">
          {mention && suggestions.length > 0 && (
            <div className="mention-menu" role="listbox" aria-label="Suggerimenti menzione">
              {suggestions.map((s, i) => (
                <button key={s.id} type="button" role="option" aria-selected={i === activeIdx} className={i === activeIdx ? 'active' : ''}
                  onMouseDown={e => { e.preventDefault(); pickMention(s.username); }}>
                  <Avatar profile={s} />@{s.username} <VerifiedMark profile={s} />
                </button>
              ))}
            </div>
          )}
          <input ref={inputRef} className="input" value={text} maxLength={500}
            onChange={e => onChangeText(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={onKeyDown}
            onClick={e => setMention(activeMentionQuery(text, e.currentTarget.selectionStart ?? text.length))}
            placeholder="Scrivi alla lega… usa @ per citare" aria-label="Messaggio" autoComplete="off" />
        </div>
        <Button type="submit" variant="primary" disabled={!text.trim() || sending}>Invia</Button>
      </form>
    </>
  );
}
