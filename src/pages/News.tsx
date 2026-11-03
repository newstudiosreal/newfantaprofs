import { useEffect } from 'react';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { listAnnouncements } from '@/lib/api';
import { fmtDate } from '@/lib/format';

// [testo del link](https://indirizzo)  oppure un indirizzo http(s) semplice.
const LINK_RE = /\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)/g;
const linkStyle = { color: '#3b8eea', textDecoration: 'underline', fontWeight: 700, overflowWrap: 'anywhere' as const };

/** Testo con link cliccabili (solo http/https); il resto resta testo semplice, nessun HTML. */
function Linkified({ text }: { text: string }) {
  const out: (string | JSX.Element)[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[2]) {
      out.push(<a key={at} href={m[2]} target="_blank" rel="noopener noreferrer" style={linkStyle}>{m[1]}</a>);
    } else {
      const bare = m[3].match(/^(.*?)([.,;:!?)]*)$/);
      const url = bare ? bare[1] : m[3];
      const tail = bare ? bare[2] : '';
      out.push(<span key={at}><a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle}>{url}</a>{tail}</span>);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

export const NEWS_SEEN_KEY = 'fp_news_seen';

export function News() {
  const { data, error, loading, reload } = useAsync(listAnnouncements, []);
  useEffect(() => {
    if (data?.length) { try { localStorage.setItem(NEWS_SEEN_KEY, String(Date.now())); } catch { /* ignora */ } }
  }, [data]);

  return (
    <main className="page">
      <h1 style={{ fontSize: '3rem', marginBottom: 14 }}>News</h1>
      {loading && <Loading />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !data.length && <Empty title="Nessuna novità">Gli annunci di FantaProf compariranno qui.</Empty>}
      <div className="stack">
        {data?.map(a => (
          <article key={a.id} className="card">
            <div className="row between">
              <h3>{a.pinned && '📌 '}{a.title}</h3>
              {a.tag && <span className="badge badge-accent">{a.tag}</span>}
            </div>
            <p className="muted tiny" style={{ margin: '4px 0 10px' }}>{fmtDate(a.created_at)}</p>
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}><Linkified text={a.body} /></p>
          </article>
        ))}
      </div>
    </main>
  );
}
