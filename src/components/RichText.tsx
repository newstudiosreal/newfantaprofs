import type { ReactNode } from 'react';
import { parseRich, type RichNode } from '@/lib/richtext';

const linkStyle = { color: '#3b8eea', textDecoration: 'underline', fontWeight: 700, overflowWrap: 'anywhere' as const };

/**
 * Testo formattato (grassetto, corsivo, barrato, codice, link). `renderPlain` permette di trattare
 * il testo semplice a modo proprio, per esempio per evidenziare le @menzioni in chat.
 */
export function RichText({ text, renderPlain }: { text: string; renderPlain?: (s: string) => ReactNode }) {
  const render = (nodes: RichNode[]): ReactNode[] => nodes.map((n, i) => {
    switch (n.t) {
      case 'text': return <span key={i}>{renderPlain ? renderPlain(n.v) : n.v}</span>;
      case 'b': return <strong key={i}>{render(n.c)}</strong>;
      case 'i': return <em key={i}>{render(n.c)}</em>;
      case 's': return <s key={i}>{render(n.c)}</s>;
      case 'code': return <code key={i} style={{ background: 'var(--surface-2, rgba(127,127,127,.18))', borderRadius: 4, padding: '0 4px' }}>{n.v}</code>;
      case 'a': return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" style={linkStyle}>{render(n.c)}</a>;
    }
  });
  return <>{render(parseRich(text))}</>;
}