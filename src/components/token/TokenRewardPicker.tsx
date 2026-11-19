import { useState } from 'react';
import { ActionButton, Button, ErrorState, Field, Loading, Modal, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { cancelTokenBadgeRequest, claimToken, getTokenOptions, listMyBadgeRequests, requestTokenBadge } from '@/lib/api.token';
import { BADGE_DESC_MAX, BADGE_TEXT_MAX, badgeTextError, notifyTokenChanged, rewardDef, REWARD_GROUPS, rewardLabel } from '@/lib/token';
import type { TokenOpen } from '@/lib/types.token';
import '@/styles/token.css';

type Step = 'choose' | 'confirm' | 'badge' | 'done' | 'sent';

/** Scelta e riscatto del premio. Offre solo ciò che il server considera idoneo e ancora disponibile per questo utente. */
export function TokenRewardPicker({ token, onClose }: { token: TokenOpen; onClose: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const opts = useAsync(() => getTokenOptions(token.id), [token.id]);
  const pending = useAsync(async () => (await listMyBadgeRequests(profile!.id)).find(r => r.status === 'pending') ?? null, [profile!.id], { enabled: token.status === 'badge_pending' });
  const [step, setStep] = useState<Step>('choose');
  const [pick, setPick] = useState<string>('');
  const [league, setLeague] = useState('');
  const [text, setText] = useState('');
  const [desc, setDesc] = useState('');
  const [claimed, setClaimed] = useState('');

  const finish = async () => { notifyTokenChanged(); await refreshProfile(); };

  // Richiesta di badge già in attesa: niente nuova scelta finché non arriva la risposta (o si annulla).
  if (token.status === 'badge_pending' && step === 'choose') {
    return (
      <Modal title="Badge in attesa" onClose={onClose}>
        {pending.loading && !pending.data && <Loading rows={1} />}
        {pending.data && (
          <div className="card-flat">
            <p className="small bold" style={{ margin: '0 0 4px' }}>La tua richiesta: «{pending.data.text}»</p>
            {pending.data.description && <p className="small muted" style={{ margin: 0 }}>{pending.data.description}</p>}
          </div>
        )}
        <p className="muted small" style={{ marginTop: 12 }}>Il SuperAdmin deve ancora approvarla. Se la rifiuta, il Token resta tuo e potrai scegliere un altro premio.</p>
        <div className="row row-wrap" style={{ marginTop: 12 }}>
          {pending.data && <ActionButton variant="danger" okMessage="Richiesta annullata: puoi scegliere un altro premio"
            onAction={async () => { await cancelTokenBadgeRequest(pending.data!.id); await finish(); onClose(); }}>Annulla richiesta</ActionButton>}
          <Button variant="ghost" onClick={onClose}>Chiudi</Button>
        </div>
      </Modal>
    );
  }

  if (step === 'done') {
    return (
      <Modal title="Premio riscattato" onClose={onClose}>
        <div className="tk-done">
          <div className="tk-done-emoji" aria-hidden="true">{rewardDef(claimed)?.emoji ?? '🎁'}</div>
          <h2 style={{ margin: '6px 0' }}>{rewardDef(claimed)?.name ?? 'Premio'}</h2>
          <p className="muted">È stato aggiunto al tuo account, gratis. Lo trovi nel tuo profilo e nelle impostazioni della lega.</p>
          <Button variant="primary" block onClick={onClose}>Fantastico</Button>
        </div>
      </Modal>
    );
  }
  if (step === 'sent') {
    return (
      <Modal title="Richiesta inviata" onClose={onClose}>
        <div className="tk-done">
          <div className="tk-done-emoji" aria-hidden="true">✍️</div>
          <p className="muted">Il SuperAdmin controllerà «{text.trim()}». Riceverai una notifica quando avrà deciso: se lo rifiuta, il Token non va perso.</p>
          <Button variant="primary" block onClick={onClose}>Ho capito</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Scegli il tuo premio" onClose={onClose}>
      {opts.loading && !opts.data && <Loading />}
      {opts.error != null && <ErrorState error={opts.error} onRetry={opts.reload} />}

      {opts.data && step === 'choose' && (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>Il Token vale un solo premio, gratis: una volta confermato non si cambia.</p>
          {!opts.data.eligible.length && <p className="muted">Al momento non ci sono premi disponibili per te. Il Token resta al sicuro: riprova più tardi.</p>}
          {REWARD_GROUPS.map(g => {
            const items = opts.data!.eligible.map(k => rewardDef(k)).filter(d => d?.group === g.id);
            if (!items.length) return null;
            return (
              <div key={g.id} className="tk-group">
                <h4>{g.label}</h4>
                <div className="tk-opt-grid">
                  {items.map(d => (
                    <button key={d!.key} type="button" className="tk-opt" aria-pressed={pick === d!.key} onClick={() => setPick(d!.key)}>
                      <b>{d!.emoji} {d!.name}</b><span>{d!.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {pick === 'pro' && (
            <Field label="Per quale lega?" hint="Solo leghe di cui sei proprietario">
              <Select value={league} onChange={setLeague} aria-label="Lega">
                <option value="">Scegli una lega</option>
                {opts.data.pro_leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          )}
          <Button variant="primary" block style={{ marginTop: 16 }} disabled={!pick || (pick === 'pro' && !league)}
            onClick={() => setStep(pick === 'custom_badge' ? 'badge' : 'confirm')}>Continua</Button>
        </>
      )}

      {step === 'confirm' && (
        <>
          <div className="card-flat" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.6rem' }} aria-hidden="true">{rewardDef(pick)?.emoji}</div>
            <h3>{rewardDef(pick)?.name}</h3>
            <p className="small muted" style={{ margin: '4px 0 0' }}>{rewardDef(pick)?.desc}</p>
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>Confermi di usare il Token per {rewardLabel(pick)}? Non costa nulla e non si può cambiare dopo.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setStep('choose')}>Indietro</Button>
            <ActionButton variant="primary" onAction={async () => {
              const r = await claimToken(token.id, pick, pick === 'pro' ? league : undefined);
              setClaimed(r.reward); setStep('done'); await finish();
            }}>Riscatta gratis</ActionButton>
          </div>
        </>
      )}

      {step === 'badge' && (
        <>
          <Field label="Testo del badge" hint={`Da 2 a ${BADGE_TEXT_MAX} caratteri. Il SuperAdmin può approvarlo, modificarlo o rifiutarlo.`}>
            <input className="input" maxLength={BADGE_TEXT_MAX} value={text} onChange={e => setText(e.target.value)} placeholder="Es. Re del 5B" autoFocus />
          </Field>
          <Field label="Descrizione (facoltativa)" hint="Spiega al SuperAdmin cosa intendi">
            <textarea className="input" rows={3} maxLength={BADGE_DESC_MAX} value={desc} onChange={e => setDesc(e.target.value)} />
          </Field>
          {text.trim() && badgeTextError(text) && <p className="small" style={{ color: 'var(--neg)' }}>{badgeTextError(text)}</p>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setStep('choose')}>Indietro</Button>
            <ActionButton variant="primary" disabled={!!badgeTextError(text)} onAction={async () => {
              await requestTokenBadge(token.id, text, desc); setStep('sent'); await finish();
            }}>Invia richiesta</ActionButton>
          </div>
        </>
      )}
    </Modal>
  );
}
