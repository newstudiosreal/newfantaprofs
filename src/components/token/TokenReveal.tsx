import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createTokenAudio, type TokenAudio, type TokenSfx } from '@/lib/tokenSound';
import { TokenCoin } from './TokenCoin';
import { TokenParticles } from './TokenParticles';
import '@/styles/token.css';

/** Sequenza: buio → messaggio → forziere → apertura → esplosione → Token. I tempi sono in ms dall'avvio. */
const PHASES = ['dim', 'mystery', 'chest', 'open', 'burst', 'reveal'] as const;
type Phase = typeof PHASES[number];
const AT: Record<Phase, number> = { dim: 0, mystery: 1300, chest: 4400, open: 6600, burst: 9300, reveal: 10000 };
const SFX_AT: Partial<Record<Phase, TokenSfx[]>> = {
  dim: ['drone'], mystery: ['shimmer'], chest: ['rumble'], open: ['creak', 'shimmer'], burst: ['burst'], reveal: ['chime'],
};
const REDUCED = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Props {
  /** Chiamata quando l'animazione arriva al Token: serve a non rifarla se l'utente ricarica. */
  onSeen: () => void;
  onContinue: () => void;
  onLater: () => void;
}

export function TokenReveal({ onSeen, onContinue, onLater }: Props) {
  const reduced = useRef(REDUCED()).current;
  const [idx, setIdx] = useState(reduced ? PHASES.length - 1 : 0);
  const [ready, setReady] = useState(reduced);
  const [muted, setMuted] = useState(false);
  const [needTap, setNeedTap] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const audio = useRef<TokenAudio | null>(null);
  const timers = useRef<number[]>([]);
  const mainBtn = useRef<HTMLButtonElement>(null);
  const seenSent = useRef(false);
  const phase = PHASES[idx];
  const at = (p: Phase) => PHASES.indexOf(p) <= idx;

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const goTo = useCallback((i: number) => {
    setIdx(prev => (i > prev ? i : prev));
  }, []);

  // Audio: creato una volta sola; se il browser lo blocca si sblocca al primo tocco.
  useEffect(() => {
    const a = createTokenAudio();
    audio.current = a;
    void a.resume().then(() => setNeedTap(a.suspended));
    const t = window.setTimeout(() => setNeedTap(a.suspended), 400);
    return () => { clearTimeout(t); a.dispose(); audio.current = null; };
  }, []);

  // Cronologia: ogni fase scatta a un tempo fisso. "Salta" porta direttamente alla fine.
  useEffect(() => {
    if (reduced) return;
    PHASES.forEach((p, i) => { if (i > 0) timers.current.push(window.setTimeout(() => goTo(i), AT[p])); });
    return clearTimers;
  }, [reduced, goTo]);

  // Effetti della singola fase.
  useEffect(() => {
    // il primo suono parte con un attimo di ritardo: serve il tempo di sbloccare l'audio del browser
    const t0 = window.setTimeout(() => SFX_AT[phase]?.forEach(s => audio.current?.play(s)), phase === 'dim' ? 450 : 0);
    timers.current.push(t0);
    if (phase === 'burst') setBurstKey(k => k + 1);
    if (phase === 'reveal' && !seenSent.current) {
      seenSent.current = true; onSeen();
      const t = window.setTimeout(() => setReady(true), reduced ? 0 : 1700);
      timers.current.push(t);
    }
  }, [phase, onSeen, reduced]);

  useEffect(() => { if (ready) mainBtn.current?.focus(); }, [ready]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const unlock = () => { if (needTap) { void audio.current?.resume().then(() => setNeedTap(false)); } };
  const skip = () => { clearTimers(); setIdx(PHASES.length - 1); };
  const toggleMute = () => { const m = !muted; setMuted(m); audio.current?.setMuted(m); };

  const cls = ['tk-root', ...PHASES.slice(0, idx + 1).map(p => `is-${p}`), reduced ? 'is-reduced' : ''].join(' ');
  const intensity = at('reveal') ? 0.7 : at('open') ? 0.55 : at('chest') ? 0.4 : at('mystery') ? 0.22 : 0;

  return createPortal(
    <div className={cls} role="dialog" aria-modal="true" aria-label="Hai trovato un FantaProf Token" onPointerDown={unlock}>
      <div className="tk-vignette" />
      <TokenParticles intensity={intensity} burstKey={burstKey} />
      <div className="tk-flash" /><div className="tk-ring" />

      <p className="tk-whisper" aria-live="polite">
        <span className="tk-w1">Qualcosa di raro si è mosso tra i tuoi appunti…</span>
        <span className="tk-w2">Sembra che ti stesse aspettando.</span>
      </p>

      <div className="tk-center">
        <div className="tk-stage">
          <div className="tk-rays" />
          <div className="tk-chest" aria-hidden="true">
            <div className="tk-chest-glow" />
            <div className="tk-chest-3d">
              <div className="tk-chest-inner" />
              <div className="tk-chest-body"><i className="tk-band tk-band-l" /><i className="tk-band tk-band-r" /><span className="tk-lock"><b /></span></div>
              <div className="tk-lid">
                <div className="tk-lid-front"><i className="tk-band tk-band-l" /><i className="tk-band tk-band-r" /></div>
                <div className="tk-lid-back" />
              </div>
            </div>
          </div>
          <div className="tk-coin-wrap"><TokenCoin spinning={!reduced} /></div>
        </div>

        <div className="tk-result">
          <h1 className="tk-title"><span>HAI TROVATO IL</span><span>FANTAPROF TOKEN!</span></h1>
          <p className="tk-sub">Un premio gratuito ti aspetta: scegli quello che preferisci.</p>
          {ready && (
            <div className="tk-actions">
              <button ref={mainBtn} type="button" className="tk-btn tk-btn-main" onClick={() => { audio.current?.play('tick'); onContinue(); }}>Scegli il tuo premio</button>
              <button type="button" className="tk-btn tk-btn-ghost" onClick={onLater}>Più tardi</button>
            </div>
          )}
        </div>
      </div>

      {!at('reveal') && idx >= 1 && <button type="button" className="tk-skip" onClick={skip}>Salta</button>}
      <button type="button" className="tk-mute" onClick={toggleMute} aria-label={muted ? 'Attiva l\'audio' : 'Disattiva l\'audio'}>{muted ? '🔇' : '🔊'}</button>
      {needTap && !muted && <p className="tk-tap">Tocca lo schermo per attivare l'audio</p>}
    </div>,
    document.body,
  );
}
