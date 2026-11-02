import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Empty, ErrorState, Loading, VerifiedMark } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { FollowButton } from '@/components/FollowButton';
import { searchCommunity } from '@/lib/api';
import { myFollows } from '@/lib/api.social';
import { useAuth } from '@/hooks/useAuth';

export function Search() {
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(raw.trim()), 300); return () => clearTimeout(t); }, [raw]);
  const { data, error, loading, reload } = useAsync(() => searchCommunity(q), [q]);
  const { profile } = useAuth();
  const follows = useAsync(myFollows, []);
  const followingIds = new Set((follows.data ?? []).filter(f => f.direction === 'following').map(f => f.user_id));

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
            <div key={u.id} className="ledger-row" style={{ gridTemplateColumns: '46px 1fr auto' }}>
              <Link to={`/profilo/${u.username}`} style={{ position: 'relative', textDecoration: 'none' }} aria-label={`Profilo di ${u.username}`}>
                <Avatar profile={u} />
                {u.online && <span className="status-dot" aria-label="Online" />}
              </Link>
              <Link to={`/profilo/${u.username}`} className="row" style={{ minWidth: 0, textDecoration: 'none' }}>
                <b className="ellipsis">{u.username}</b><VerifiedMark profile={u} />
                {u.online && <span className="muted small">🟢</span>}
              </Link>
              {u.id !== profile?.id && follows.data && <FollowButton userId={u.id} initial={followingIds.has(u.id)} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
