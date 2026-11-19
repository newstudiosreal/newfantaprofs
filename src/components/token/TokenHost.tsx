import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getOpenToken, markTokenSeen, registerTokenVisit } from '@/lib/api.token';
import { TOKEN_CHANGED_EVENT } from '@/lib/token';
import type { TokenOpen } from '@/lib/types.token';
import { TokenReveal } from './TokenReveal';
import { TokenRewardPicker } from './TokenRewardPicker';
import '@/styles/token.css';

/** Intervallo minimo tra due chiamate dal client. Il conteggio vero lo decide il server (può essere più lungo). */
const CLIENT_MIN_GAP = 60_000;

/**
 * Montato una sola volta nella shell dell'app: registra l'accesso, mostra l'animazione quando il Token viene trovato
 * (o è stato trovato e non ancora visto) e offre la scelta del premio. Non decide nulla: probabilità e conteggi sono sul server.
 */
export function TokenHost() {
  const { session, profile } = useAuth();
  const uid = profile?.id;
  const [open, setOpen] = useState<TokenOpen | null>(null);
  const [stage, setStage] = useState<'idle' | 'reveal' | 'pick'>('idle');
  const last = useRef(0);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const apply = useCallback((t: TokenOpen | null) => {
    setOpen(t);
    if (!t) { setStage('idle'); return; }
    if (!t.seen && stageRef.current === 'idle' && t.status === 'available') setStage('reveal');
  }, []);

  // Accesso: all'apertura e quando si torna sulla scheda (il server ignora i ritorni ravvicinati).
  useEffect(() => {
    if (!session || !uid) return;
    const visit = async () => {
      if (last.current && Date.now() - last.current < CLIENT_MIN_GAP) return;
      last.current = Date.now();
      try { apply((await registerTokenVisit()).open); } catch { /* il Token non deve mai disturbare l'app */ }
    };
    void visit();
    const onVis = () => { if (!document.hidden) void visit(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [session, uid, apply]);

  // Stato cambiato altrove (riscatto dal profilo, richiesta badge…)
  useEffect(() => {
    if (!uid) return;
    const onChange = () => { getOpenToken(uid).then(t => { setOpen(t); if (!t) setStage('idle'); }).catch(() => undefined); };
    window.addEventListener(TOKEN_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(TOKEN_CHANGED_EVENT, onChange);
  }, [uid]);

  const seen = useCallback(() => {
    if (open) { void markTokenSeen(open.id).catch(() => undefined); setOpen(o => (o ? { ...o, seen: true } : o)); }
  }, [open]);

  if (!open) return null;
  return (
    <>
      {stage === 'reveal' && <TokenReveal onSeen={seen} onContinue={() => setStage('pick')} onLater={() => setStage('idle')} />}
      {stage === 'idle' && open.seen && open.status === 'available' && (
        <button type="button" className="tk-chip" onClick={() => setStage('pick')}><span aria-hidden="true">🪙</span> Hai un FantaProf Token: scegli il premio</button>
      )}
      {stage === 'pick' && <TokenRewardPicker token={open} onClose={() => { setStage('idle'); if (uid) getOpenToken(uid).then(setOpen).catch(() => undefined); }} />}
    </>
  );
}
