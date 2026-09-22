import type { ReactNode } from 'react';
import { createElement, Fragment } from 'react';

/** Stesso pattern username usato dal DB: 3-20 caratteri tra lettere, numeri e underscore. */
export const MENTION_RE = /@([A-Za-z0-9_]{3,20})/g;

/**
 * Se il cursore si trova subito dopo un "@parola" (senza spazi in mezzo), restituisce
 * l'indice di inizio del token e il testo digitato finora, per pilotare l'autocompletamento.
 */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const uptoCaret = text.slice(0, caret);
  const m = /(?:^|\s)@([A-Za-z0-9_]{0,20})$/.exec(uptoCaret);
  if (!m) return null;
  return { start: caret - m[1].length - 1, query: m[1] };
}

/** Sostituisce il token @query attivo con lo username scelto, e restituisce il nuovo testo + la posizione del cursore. */
export function applyMention(text: string, start: number, caret: number, username: string): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(caret);
  const insert = `@${username} `;
  return { text: before + insert + after, caret: before.length + insert.length };
}

/** Spezza il testo di un messaggio evidenziando le @menzioni che corrispondono a membri reali della lega. */
export function renderWithMentions(
  body: string,
  isKnownUsername: (username: string) => boolean,
  onMention: (username: string) => void,
): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const idx = m.index ?? 0;
    const username = m[1];
    if (!isKnownUsername(username)) continue;
    if (idx > last) parts.push(createElement(Fragment, { key: key++ }, body.slice(last, idx)));
    parts.push(
      createElement('button', {
        key: key++, type: 'button', className: 'mention', onClick: () => onMention(username),
      }, `@${username}`),
    );
    last = idx + m[0].length;
  }
  if (last < body.length) parts.push(createElement(Fragment, { key: key++ }, body.slice(last)));
  return parts;
}

/** True se il messaggio menziona esplicitamente lo username indicato. */
export function mentionsUser(body: string, username: string): boolean {
  if (!username) return false;
  const re = new RegExp(`@${username}\\b`, 'i');
  return re.test(body);
}
