import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { listMyBadgeRequests, listMyTokenFinds } from '@/lib/api.token';
import { fmtDate } from '@/lib/format';
import { findStatusLabel, REQUEST_STATUS_LABEL, TOKEN_CHANGED_EVENT } from '@/lib/token';
import type { Profile } from '@/lib/types';
import { TokenRewardPicker } from './TokenRewardPicker';
import '@/styles/token.css';

/**
 * Sezione del profilo: compare solo a chi ha trovato almeno un Token (il Token non è mai un oggetto sempre visibile).
 * Mostra l'eventuale Token da riscattare, lo storico dei ritrovamenti/premi e lo stato delle richieste di badge.
 */
export function TokenSection({ profile }: { profile: Profile }) {
  const finds = useAsync(() => listMyTokenFinds(profile.id), [profile.id]);
  const reqs = useAsync(() => listMyBadgeRequests(profile.id), [profile.id]);
  const [pick, setPick] = useState(false);

  const reloadFinds = finds.reload, reloadReqs = reqs.reload;
  useEffect(() => {
    const on = () => { void reloadFinds(); void reloadReqs(); };
    window.addEventListener(TOKEN_CHANGED_EVENT, on);
    return () => window.removeEventListener(TOKEN_CHANGED_EVENT, on);
  }, [reloadFinds, reloadReqs]);

  if (!finds.data?.length) return null;
  const openTk = finds.data.find(f => f.status !== 'redeemed');

  return (
    <>
      <div className="section-title"><h2>FantaProf Token</h2></div>
      {openTk && (
        <div className="tk-gold-card" style={{ marginBottom: 12 }}>
          <h3>{openTk.status === 'badge_pending' ? '✍️ Badge in attesa' : '🪙 Hai un Token da riscattare'}</h3>
          <p className="small muted" style={{ margin: '6px 0 12px' }}>
            {openTk.status === 'badge_pending'
              ? 'Il SuperAdmin sta valutando il tuo badge. Se lo rifiuta, il Token resta tuo.'
              : 'Trovato il ' + fmtDate(openTk.found_at) + '. Scegli un prodotto gratuito.'}
          </p>
          <Button variant="primary" onClick={() => setPick(true)}>{openTk.status === 'badge_pending' ? 'Vedi la richiesta' : 'Scegli il premio'}</Button>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>I tuoi Token</h3>
        {finds.data.map(f => (
          <div key={f.id} className="row between row-wrap" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span className="small"><b>🪙 {fmtDate(f.found_at)}</b></span>
            <span className={f.status === 'redeemed' ? 'badge badge-pos' : 'badge badge-accent'}>{findStatusLabel(f)}</span>
          </div>
        ))}
      </div>

      {!!reqs.data?.length && (
        <>
          <div className="section-title"><h2>Richieste badge</h2></div>
          <div className="card">
            {reqs.data.map(r => (
              <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="row between row-wrap">
                  <span><b>{r.status === 'approved' && r.final_text ? r.final_text : r.text}</b>
                    {r.status === 'approved' && r.final_text && r.final_text !== r.text && <span className="tiny muted"> (richiesto: «{r.text}»)</span>}</span>
                  <span className="badge">{REQUEST_STATUS_LABEL[r.status]}</span>
                </div>
                <div className="tiny muted">inviata il {fmtDate(r.created_at)}</div>
                {r.status === 'rejected' && (
                  <p className="small" style={{ margin: '4px 0 0' }}>{r.admin_note ? `Motivo: ${r.admin_note}. ` : ''}Il Token è tornato disponibile: scegli un altro premio.</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {pick && openTk && (
        <TokenRewardPicker token={{ id: openTk.id, status: openTk.status, seen: openTk.seen_at != null, found_at: openTk.found_at }} onClose={() => { setPick(false); void finds.reload(); void reqs.reload(); }} />
      )}
    </>
  );
}
