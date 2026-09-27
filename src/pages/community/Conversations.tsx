import { Link } from 'react-router-dom';
import { Avatar, Empty, ErrorState, Loading, VerifiedMark } from '@/components/ui';
import type { ConversationSummary } from '@/lib/api';
import { timeAgo } from '@/lib/format';

export function Conversations({ data, loading, error, onReload }:
  { data: ConversationSummary[] | undefined; loading: boolean; error: unknown; onReload: () => void }) {
  if (loading && !data) return <Loading />;
  if (error != null) return <ErrorState error={error} onRetry={onReload} />;
  if (data && !data.length) return <Empty title="Nessun messaggio">Apri il profilo di un utente dalla Community per scrivergli.</Empty>;
  return (
    <div className="ledger">
      {data?.map(c => {
        const preview = c.last ? (c.last.deleted_at ? 'Messaggio eliminato' : c.last.body ?? '') : 'Nessun messaggio';
        return (
          <Link key={c.conversation.id} to={c.conversation.id} className="ledger-row" style={{ gridTemplateColumns: '46px 1fr auto' }}>
            <span style={{ position: 'relative' }}>
              <Avatar profile={c.other} />
              {c.other?.online && <span className="status-dot" aria-label="Online" />}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="row"><b className="ellipsis">{c.other?.username ?? 'Utente'}</b><VerifiedMark profile={c.other} /></span>
              <span className="muted small ellipsis" style={{ display: 'block' }}>{preview}</span>
            </span>
            <span style={{ textAlign: 'right' }}>
              {c.last && <div className="tiny muted">{timeAgo(c.last.created_at)}</div>}
              {c.unread > 0 && <span className="badge badge-accent">{c.unread}</span>}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
