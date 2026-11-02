import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionButton, Avatar, Button, Empty, ErrorState, Loading, VerifiedMark } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useRealtime } from '@/hooks/useRealtime';
import { useToast } from '@/hooks/useToast';
import { deleteMessage } from '@/lib/api';
import { listChatMessages, listReactions, pinMessage, sendChatMessage, toggleReaction, unpinMessage } from '@/lib/api.social';
import { explain } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { activeMentionQuery, applyMention, mentionsUser, renderWithMentions } from '@/lib/mentions';
import { REACTION_EMOJIS, type ChatMessage, type MessageReaction } from '@/lib/types.social';
import { ChatPolls } from './ChatPolls';
import { useLeague } from './context';

export const chatSeenKey = (leagueId: string) => `fp_chat_seen_${leagueId}`;

async function loadChat(leagueId: string) {
  const messages = await listChatMessages(leagueId);
  const reactions = await listReactions(messages.map(m => m.id)).catch(() => [] as MessageReaction[]);
  return { messages, reactions };
}

const preview = (s: string) => (s.length > 70 ? `${s.slice(0, 70)}…` : s);

export function Chat() {
  const { bundle, meId, isAdmin, userById } = useLeague();
  const leagueId = bundle.league.id;
  const nav = useNavigate();
  const toast = useToast();
  // Realtime per l'istantaneo; il polling lento è solo una rete di sicurezza.
  const { data, error, loading, reload } = useAsync(() => loadChat(leagueId), [leagueId], { interval: 60_000 });
  useRealtime([{ table: 'messages', filter: `league_id=eq.${leagueId}` }, 'message_reactions'], { onChange: () => { void reload(); }, debounceMs: 250 });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messages = useMemo(() => (data ? [...data.messages].reverse() : []), [data]);
  const byId = useMemo(() => new Map(messages.map(m => [m.id, m])), [messages]);
  const pinned = messages.find(m => m.pinned_at);
  const reactionsOf = useMemo(() => {
    const map = new Map<string, Map<string, { n: number; mine: boolean }>>();
    for (const r of data?.reactions ?? []) {
      const perMsg = map.get(r.message_id) ?? new Map();
      const cur = perMsg.get(r.emoji) ?? { n: 0, mine: false };
      perMsg.set(r.emoji, { n: cur.n + 1, mine: cur.mine || r.user_id === meId });
      map.set(r.message_id, perMsg);
    }
    return map;
  }, [data?.reactions, meId]);
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
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [leagueId, data?.messages.length]);

  useEffect(() => { setActiveIdx(0); }, [mention?.query]);

  const onChangeText = (value: string, caret: number) => { setText(value); setMention(activeMentionQuery(value, caret)); };

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
    try { await sendChatMessage(leagueId, body, replyTo?.id); setText(''); setMention(null); setReplyTo(null); await reload(); }
    catch (err) { toast.error(explain(err)); }
    finally { setSending(false); }
  };

  const react = async (m: ChatMessage, emoji: string) => {
    setPickerFor(null);
    try { await toggleReaction(m.id, emoji); await reload(); } catch (err) { toast.error(explain(err)); }
  };

  const quote = (m: ChatMessage) => {
    if (!m.reply_to) return null;
    const parent = byId.get(m.reply_to);
    return (
      <div className="reply-quote" aria-label="In risposta a">
        {parent ? <><b>{parent.author_id === meId ? 'Tu' : userById(parent.author_id)?.username ?? '?'}</b> {preview(parent.body)}</> : <i>Messaggio non più disponibile</i>}
      </div>
    );
  };

  return (
    <>
      <ChatPolls />
      {pinned && (
        <div className="pinned-msg" role="note">
          <span className="tiny bold">📌 Fissato</span>
          <div className="small"><b>{pinned.author_id === meId ? 'Tu' : userById(pinned.author_id)?.username ?? '?'}:</b> {renderWithMentions(pinned.body, u => usernameSet.has(u.toLowerCase()), u => nav(`/profilo/${u}`))}</div>
          {isAdmin && <ActionButton size="sm" variant="ghost" onAction={async () => { await unpinMessage(pinned.id); await reload(); }}>Rimuovi dalla cima</ActionButton>}
        </div>
      )}
      {loading && !data && <Loading />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !messages.length && <Empty title="Chat vuota">Scrivi il primo messaggio alla lega. Usa @ per citare un compagno di lega.</Empty>}
      <div className="chat" aria-live="polite">
        {messages.map(m => {
          const mine = m.author_id === meId; const author = userById(m.author_id);
          const mentioned = !mine && !!me?.username && mentionsUser(m.body, me.username);
          const rs = reactionsOf.get(m.id);
          return (
            <div key={m.id} className={`bubble ${mine ? 'mine' : ''} ${mentioned ? 'mentioned' : ''}`}>
              <div className="row" style={{ gap: 6 }}>{!mine && <Avatar profile={author} />}
                <span className="who">{mine ? 'Tu' : author?.username ?? '?'} <VerifiedMark profile={author} /> · {timeAgo(m.created_at)}{m.pinned_at ? ' · 📌' : ''}</span></div>
              {quote(m)}
              <div>{renderWithMentions(m.body, u => usernameSet.has(u.toLowerCase()), u => nav(`/profilo/${u}`))}</div>
              <div className="reactions">
                {rs && [...rs.entries()].map(([emoji, { n, mine: isMine }]) => (
                  <button key={emoji} type="button" className={`react-chip ${isMine ? 'on' : ''}`} aria-pressed={isMine} aria-label={`${emoji} ${n}`} onClick={() => void react(m, emoji)}>{emoji} {n}</button>
                ))}
                <button type="button" className="react-chip" aria-label="Aggiungi reazione" aria-expanded={pickerFor === m.id} onClick={() => setPickerFor(p => (p === m.id ? null : m.id))}>☺+</button>
                {pickerFor === m.id && (
                  <span className="react-picker" role="group" aria-label="Scegli una reazione">
                    {REACTION_EMOJIS.map(e => <button key={e} type="button" className="react-chip" aria-label={`Reagisci con ${e}`} onClick={() => void react(m, e)}>{e}</button>)}
                  </span>
                )}
              </div>
              <div className="row row-wrap" style={{ gap: 4 }}>
                <Button size="sm" variant="ghost" onClick={() => { setReplyTo(m); inputRef.current?.focus(); }}>Rispondi</Button>
                {isAdmin && (m.pinned_at
                  ? <ActionButton size="sm" variant="ghost" onAction={async () => { await unpinMessage(m.id); await reload(); }}>Stacca</ActionButton>
                  : <ActionButton size="sm" variant="ghost" okMessage="Messaggio fissato" onAction={async () => { await pinMessage(m.id); await reload(); }}>Fissa</ActionButton>)}
                {(mine || isAdmin) && <ActionButton size="sm" variant="ghost" onAction={async () => { await deleteMessage(m.id); await reload(); }}>Elimina</ActionButton>}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="chat-form" onSubmit={submit}>
        <div className="chat-input-wrap">
          {replyTo && (
            <div className="reply-banner">
              <span className="ellipsis">↩︎ Rispondi a <b>{replyTo.author_id === meId ? 'te' : userById(replyTo.author_id)?.username ?? '?'}</b>: {preview(replyTo.body)}</span>
              <Button size="sm" variant="ghost" aria-label="Annulla risposta" onClick={() => setReplyTo(null)}>✕</Button>
            </div>
          )}
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
