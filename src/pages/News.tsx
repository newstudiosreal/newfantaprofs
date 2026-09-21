import { useEffect } from 'react';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { listAnnouncements } from '@/lib/api';
import { fmtDate } from '@/lib/format';

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
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{a.body}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
