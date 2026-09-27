import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Empty, ErrorState, Loading, VerifiedMark } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { searchCommunity } from '@/lib/api';

export function Search() {
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(raw.trim()), 300); return () => clearTimeout(t); }, [raw]);
  const { data, error, loading, reload } = useAsync(() => searchCommunity(q), [q]);

  return (
    <>
      <h1 style={{ fontSize: '3rem', marginBottom: 12 }}>Community</h1>
      <input className="input" placeholder="Cerca per username…" value={raw} onChange={e => setRaw(e.target.value)}
        aria-label="Cerca utenti" style={{ marginBottom: 14 }} autoComplete="off" />
      {loading && !data && <Loading />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !data.length && <Empty title="Nessun utente trovato" />}
      {data && data.length > 0 && (
        <div className="ledger">
          {data.map(u => (
            <Link key={u.id} to={`/profilo/${u.username}`} className="ledger-row" style={{ gridTemplateColumns: '46px 1fr auto' }}>
              <span style={{ position: 'relative' }}>
                <Avatar profile={u} />
                {u.online && <span className="status-dot" aria-label="Online" />}
              </span>
              <span className="row" style={{ minWidth: 0 }}>
                <b className="ellipsis">{u.username}</b><VerifiedMark profile={u} />
              </span>
              <span className="muted small">{u.online ? '🟢 Online' : ''}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
