import { Link } from 'react-router-dom';
import { Avatar, Empty, ErrorState, Loading, VerifiedMark } from '@/components/ui';
import { FollowButton } from '@/components/FollowButton';
import { useAsync } from '@/hooks/useAsync';
import { followFeed, myFollows } from '@/lib/api.social';
import { timeAgo } from '@/lib/format';
import type { FeedItem, FollowEntry } from '@/lib/types.social';

const KIND_ICON: Record<string, string> = { mercato: '🛒', scambio: '🔁', stagione: '🏁', sfida: '⚔️' };

function Person({ u, followBack }: { u: FollowEntry; followBack?: boolean }) {
  return (
    <div className="ledger-row" style={{ gridTemplateColumns: '46px 1fr auto' }}>
      <Avatar profile={u} />
      <Link to={`/profilo/${u.username}`} className="row" style={{ minWidth: 0, textDecoration: 'none' }}><b className="ellipsis">{u.username}</b><VerifiedMark profile={u} /></Link>
      {followBack !== undefined && <FollowButton userId={u.user_id} initial={followBack} />}
    </div>
  );
}

export function Following() {
  const follows = useAsync(myFollows, []);
  const feed = useAsync(() => followFeed(50), [], { interval: 120_000 });
  const following = (follows.data ?? []).filter(f => f.direction === 'following');
  const followers = (follows.data ?? []).filter(f => f.direction === 'follower');
  const followingIds = new Set(following.map(f => f.user_id));

  return (
    <>
      <h1 style={{ fontSize: '3rem', marginBottom: 6 }}>Seguiti</h1>
      <p className="muted small" style={{ marginTop: 0 }}>{following.length} {following.length === 1 ? 'seguito' : 'seguiti'} · {followers.length} follower. Vedi solo le attività delle leghe in cui ci sei anche tu.</p>

      <div className="section-title"><h2>Attività recenti</h2></div>
      {feed.loading && !feed.data && <Loading rows={2} />}
      {feed.error != null && <ErrorState error={feed.error} onRetry={feed.reload} />}
      {feed.data && !feed.data.length && (
        <Empty title="Ancora nulla da vedere">{following.length ? 'Quando i giocatori che segui compravendono, scambiano o chiudono una stagione lo vedrai qui.' : 'Segui qualche giocatore dalla ricerca community o dal suo profilo.'}</Empty>
      )}
      {feed.data && feed.data.length > 0 && (
        <div className="card">
          {feed.data.map((it: FeedItem, i) => (
            <div key={`${it.at}-${i}`} className="feed-item">
              <span aria-hidden="true">{KIND_ICON[it.kind] ?? '•'}</span>
              <span style={{ minWidth: 0 }}>{it.text}<span className="muted tiny" style={{ display: 'block' }}>{timeAgo(it.at)}</span></span>
              <Link to={`/leghe/${it.league_id}`} className="small bold">Lega</Link>
            </div>
          ))}
        </div>
      )}

      <div className="section-title"><h2>Chi segui</h2></div>
      {follows.loading && !follows.data && <Loading rows={1} />}
      {follows.error != null && <ErrorState error={follows.error} onRetry={follows.reload} />}
      {follows.data && !following.length && <Empty title="Non segui nessuno" />}
      {following.length > 0 && <div className="ledger">{following.map(u => <Person key={u.user_id} u={u} followBack />)}</div>}

      <div className="section-title"><h2>I tuoi follower</h2></div>
      {follows.data && !followers.length && <Empty title="Nessun follower per ora" />}
      {followers.length > 0 && <div className="ledger">{followers.map(u => <Person key={u.user_id} u={u} followBack={followingIds.has(u.user_id)} />)}</div>}
    </>
  );
}
