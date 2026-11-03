/**
 * Formattazione leggera dei testi, stile WhatsApp:
 *   *grassetto*  **grassetto**  _corsivo_  ~barrato~  `codice`  [testo](https://link)  https://link
 * Produce un albero di nodi: nessun HTML, quindi niente rischi di injection. Solo link http/https.
 */
export type RichNode =
  | { t: 'text'; v: string }
  | { t: 'b' | 'i' | 's'; c: RichNode[] }
  | { t: 'code'; v: string }
  | { t: 'a'; href: string; c: RichNode[] };

const RE = new RegExp([
  '\\[([^\\]\\n]{1,80})\\]\\((https?:\\/\\/[^\\s)]+)\\)', // 1,2 link con testo
  '(https?:\\/\\/[^\\s<>"\']+)',                           // 3 link semplice
  '`([^`\\n]+)`',                                          // 4 codice
  '\\*\\*(\\S(?:[^\\n]*?\\S)?)\\*\\*',                      // 5 **grassetto**
  '\\*(\\S(?:[^*\\n]*?\\S)?)\\*',                           // 6 *grassetto*
  '_(\\S(?:[^_\\n]*?\\S)?)_',                              // 7 _corsivo_
  '~(\\S(?:[^~\\n]*?\\S)?)~',                              // 8 ~barrato~
].join('|'), 'g');

const WORD = /[A-Za-z0-9_]/;
const MAX_DEPTH = 4;

export function parseRich(text: string, depth = 0): RichNode[] {
  const out: RichNode[] = [];
  const push = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.t === 'text') last.v += v; else out.push({ t: 'text', v });
  };
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const at = m.index ?? 0;
    const end = at + m[0].length;
    const before = at > 0 ? text[at - 1] : '';
    const after = end < text.length ? text[end] : '';
    const inner = (s: string) => (depth < MAX_DEPTH ? parseRich(s, depth + 1) : [{ t: 'text', v: s } as RichNode]);
    let node: RichNode | null = null;
    let tail = '';
    if (m[2]) node = { t: 'a', href: m[2], c: [{ t: 'text', v: m[1] }] };
    else if (m[3]) {
      const bare = m[3].match(/^(.*?)([.,;:!?)]*)$/);
      const url = bare ? bare[1] : m[3];
      tail = bare ? bare[2] : '';
      node = { t: 'a', href: url, c: [{ t: 'text', v: url }] };
    } else if (m[4] !== undefined) node = { t: 'code', v: m[4] };
    else if (m[5] !== undefined) node = { t: 'b', c: inner(m[5]) };
    else if (m[6] !== undefined) { if (!WORD.test(before) && !WORD.test(after)) node = { t: 'b', c: inner(m[6]) }; }
    else if (m[7] !== undefined) { if (!WORD.test(before) && !WORD.test(after)) node = { t: 'i', c: inner(m[7]) }; }
    else if (m[8] !== undefined) { if (!WORD.test(before) && !WORD.test(after)) node = { t: 's', c: inner(m[8]) }; }
    if (!node) continue; // non valido (es. snake_case): resta testo
    push(text.slice(last, at));
    out.push(node);
    push(tail);
    last = end;
  }
  push(text.slice(last));
  return out;
}