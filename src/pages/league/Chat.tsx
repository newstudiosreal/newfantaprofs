import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { ActionButton, Avatar, Button, Empty, ErrorState, Loading } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { deleteMessage, listMessages, sendMessage } from '@/lib/api';
import { explain } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { useLeague } from './context';

export const chatSeenKey = (leagueId: string) => `fp_chat_seen_${leagueId}`;
export const chatMentionsSeenKey = (leagueId: string) => `fp_chat_mentions_seen_${leagueId}`;

export function Chat() {
  const { bundle, meId, isAdmin, userById } = useLeague();
  const leagueId = bundle.league.id;
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(
    () => listMessages(leagueId),
    [leagueId],
    { interval: 6_000 }
  );

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [highlighted, setHighlighted] = useState(0);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messages = data ? [...data].reverse() : [];

  // Lista username dei membri della lega (esclude me stesso)
  const myUsername = userById(meId)?.username;
  const memberUsernames = useMemo(() => {
    // Adatta qui se bundle.members ha una forma diversa (es. array di oggetti)
    const ids: string[] = (bundle as any).members ?? [];
    const names = ids
      .map(id => userById(id)?.username)
      .filter((u): u is string => !!u && u !== myUsername);
    // rimuove duplicati e ordina
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [bundle, userById, myUsername]);

  // Suggerimenti filtrati per la query corrente
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return memberUsernames
      .filter(u => u.toLowerCase().startsWith(q))
      .slice(0, 8);
  }, [mentionQuery, memberUsernames]);

  const showSuggestions = mentionQuery !== null && suggestions.length > 0;

  // Scroll in fondo + marca chat vista
  useEffect(() => {
    try {
      localStorage.setItem(chatSeenKey(leagueId), String(Date.now()));
    } catch { /* ignora */ }
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [leagueId, data?.length]);

  // Marca come viste le menzioni ogni volta che i messaggi cambiano
  // mentre l'utente è nella chat.
  useEffect(() => {
    if (!data?.length || !myUsername) return;
    const re = new RegExp(`@${myUsername}\\b`);
    const hasMention = data.some(
      m => m.author_id !== meId && re.test(m.body)
    );
    if (hasMention) {
      try {
        localStorage.setItem(chatMentionsSeenKey(leagueId), String(Date.now()));
      } catch { /* ignora */ }
    }
  }, [data, leagueId, meId, myUsername]);

  // --- Gestione input + autocompletamento ---

  const handleChange = (value: string, cursor: number) => {
    setText(value);
    const before = value.slice(0, cursor);
    const at = before.lastIndexOf('@');
    if (at === -1) {
      setMentionQuery(null);
      setMentionStart(-1);
      return;
    }
    const after = before.slice(at + 1);
    // Annulla se c'è uno spazio tra @ e cursore
    if (/\s/.test(after)) {
      setMentionQuery(null);
      setMentionStart(-1);
      return;
    }
    setMentionQuery(after);
    setMentionStart(at);
    setHighlighted(0);
  };

  const applySuggestion = (username: string) => {
    if (mentionStart < 0) return;
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? text.length;
    const before = text.slice(0, mentionStart);
    const after = text.slice(cursor);
    const next = `${before}@${username} ${after}`;
    setText(next);
    setMentionQuery(null);
    setMentionStart(-1);
    // Riporta il cursore dopo la menzione
    requestAnimationFrame(() => {
      const pos = before.length + username.length + 2;
      input?.focus();
      input?.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applySuggestion(suggestions[highlighted]);
    } else if (e.key === 'Escape') {
      setMentionQuery(null);
      setMentionStart(-1);
    }
  };

  // --- Invio ---

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendMessage(leagueId, body);
      setText('');
      setMentionQuery(null);
      setMentionStart(-1);
      await reload();
    } catch (err) {
      toast.error(explain(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {loading && !data && <Loading />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !messages.length && (
        <Empty title="Chat vuota">Scrivi il primo messaggio alla lega.</Empty>
      )}

      <div className="chat" aria-live="polite">
        {messages.map(m => {
          const mine = m.author_id === meId;
          const author = userById(m.author_id);
          return (
            <div key={m.id} className={`bubble ${mine ? 'mine' : ''}`}>
              <div className="row" style={{ gap: 6 }}>
                {!mine && <Avatar profile={author} />}
                <span className="who">
                  {mine ? 'Tu' : author?.username ?? '?'} · {timeAgo(m.created_at)}
                </span>
              </div>
              <div>{renderWithMentions(m.body, memberUsernames)}</div>
              {(mine || isAdmin) && (
                <ActionButton
                  size="sm"
                  variant="ghost"
                  onAction={async () => {
                    await deleteMessage(m.id);
                    await reload();
                  }}
                >
                  Elimina
                </ActionButton>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form className="chat-form" onSubmit={submit} style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          className="input"
          value={text}
          maxLength={500}
          onChange={e =>
            handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }
          onKeyDown={onKeyDown}
          placeholder="Scrivi alla lega… usa @ per taggare"
          aria-label="Messaggio"
          autoComplete="off"
        />
        <Button type="submit" variant="primary" disabled={!text.trim() || sending}>
          Invia
        </Button>

        {showSuggestions && (
          <div className="mention-suggest" role="listbox">
            {suggestions.map((u, i) => (
              <button
                type="button"
                key={u}
                role="option"
                aria-selected={i === highlighted}
                className={`mention-item ${i === highlighted ? 'active' : ''}`}
                onMouseDown={e => {
                  e.preventDefault();
                  applySuggestion(u);
                }}
                onMouseEnter={() => setHighlighted(i)}
              >
                @{u}
              </button>
            ))}
          </div>
        )}
      </form>
    </>
  );
}

// --- Helper: evidenzia le @menzioni nel testo del messaggio ---
function renderWithMentions(body: string, usernames: string[]) {
  const parts = body.split(/(@[A-Za-z0-9_]+)/g);
  return parts.map((p, i) => {
    const m = p.match(/^@([A-Za-z0-9_]+)$/);
    if (m && usernames.includes(m[1])) {
      return (
        <span key={i} className="mention">
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}
