import { Link } from 'react-router-dom';
import { Avatar, Empty, ErrorState, Loading } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { getSetting, hallOfFame } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export function HallOfFame() {
  const { profile } = useAuth();
  const { data, error, loading, reload } = useAsync(hallOfFame, [], { interval: 60_000 });
  const since = useAsync(() => getSetting<number>('hof_since', 0), []);
  const resetAt = Number(since.data ?? 0);

  return (
    <main className="page">
      <h1 style={{ fontSize: '3rem' }}>Hall of Fame</h1>
      <p className="muted">
        Classifica globale di tutte le leghe{resetAt ? ` dal reset del ${fmtDate(new Date(resetAt).toISOString())}` : ''}.
        Conta la somma dei punti delle tue squadre.
      </p>
      {loading && <Loading rows={5} />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !data.length && <Empty title="Ancora nessun punteggio">Entra in una lega e crea la tua squadra per comparire qui.</Empty>}
      {data && data.length > 0 && (
        <div className="ledger">
          {data.map((r, i) => (
            <Link key={r.user_id} to={`/profilo/${r.username}`} className={`ledger-row ${r.user_id === profile?.id ? 'me' : ''}`}>
              <span className={`rank ${i < 3 ? `r${i + 1}` : ''}`}>{i + 1}</span>
              <span className="row" style={{ minWidth: 0 }}>
                <Avatar profile={r} />
                <span className="grow"><b className="ellipsis" style={{ display: 'block' }}>{r.username}</b>
                  <span className="muted tiny">{r.leagues} {r.leagues === 1 ? 'lega' : 'leghe'}</span></span>
              </span>
              <span className="score">{r.total}<small>PUNTI</small></span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
