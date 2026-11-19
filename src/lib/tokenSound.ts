/**
 * Suoni del ritrovamento, sintetizzati con WebAudio: nessun file da caricare.
 * I browser bloccano l'audio senza un gesto dell'utente: `suspended` lo segnala e `resume()` lo sblocca (al primo tocco).
 */
export type TokenSfx = 'drone' | 'shimmer' | 'rumble' | 'creak' | 'burst' | 'chime' | 'tick';

export interface TokenAudio {
  play: (sfx: TokenSfx) => void;
  resume: () => Promise<void>;
  setMuted: (m: boolean) => void;
  readonly suspended: boolean;
  dispose: () => void;
}

type AC = typeof AudioContext;

export function createTokenAudio(): TokenAudio {
  const Ctor: AC | undefined = typeof window === 'undefined' ? undefined
    : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext);
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = false;

  const ensure = (): AudioContext | null => {
    if (!Ctor) return null;
    if (!ctx) {
      try {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.55;
        master.connect(ctx.destination);
        const len = ctx.sampleRate * 2;
        noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch { ctx = null; return null; }
    }
    return ctx;
  };

  const env = (g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) => {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  };
  const osc = (c: AudioContext, type: OscillatorType, f: number, t: number, dur: number, to?: AudioNode) => {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.connect(to ?? master!); o.start(t); o.stop(t + dur);
    return o;
  };
  const noiseSrc = (c: AudioContext, t: number, dur: number) => {
    const n = c.createBufferSource(); n.buffer = noise; n.loop = true; n.start(t); n.stop(t + dur);
    return n;
  };

  const sfx: Record<TokenSfx, (c: AudioContext, t: number) => void> = {
    drone(c, t) {
      const g = c.createGain(); const f = c.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(160, t); f.frequency.exponentialRampToValueAtTime(900, t + 3);
      f.connect(g); g.connect(master!); env(g, t, 0.28, 1.2, 1.4, 1.2);
      osc(c, 'sawtooth', 55, t, 4, f); osc(c, 'sine', 82.4, t, 4, f).detune.value = 6;
    },
    shimmer(c, t) {
      for (let i = 0; i < 9; i++) {
        const g = c.createGain(); g.connect(master!);
        const at = t + i * 0.16 + Math.random() * 0.08;
        env(g, at, 0.07 + Math.random() * 0.05, 0.01, 0, 0.5);
        osc(c, 'sine', 1800 + Math.random() * 1800, at, 0.7, g);
      }
    },
    rumble(c, t) {
      const g = c.createGain(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140;
      noiseSrc(c, t, 2).connect(f); f.connect(g); g.connect(master!); env(g, t, 0.55, 0.3, 1.1, 0.6);
    },
    creak(c, t) {
      const g = c.createGain(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 6;
      f.connect(g); g.connect(master!); env(g, t, 0.16, 0.2, 1.3, 0.5);
      const o = osc(c, 'sawtooth', 200, t, 2.1, f);
      o.frequency.exponentialRampToValueAtTime(95, t + 2);
      const lfo = c.createOscillator(); const lg = c.createGain(); lfo.frequency.value = 11; lg.gain.value = 14;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 2.1);
    },
    burst(c, t) {
      const g = c.createGain(); const f = c.createBiquadFilter(); f.type = 'highpass';
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(5000, t + 1.2);
      noiseSrc(c, t, 1.4).connect(f); f.connect(g); g.connect(master!); env(g, t, 0.5, 0.02, 0.1, 1.1);
      const b = c.createGain(); b.connect(master!); env(b, t, 0.9, 0.01, 0.05, 0.9);
      osc(c, 'sine', 120, t, 1, b).frequency.exponentialRampToValueAtTime(32, t + 0.8);
      [523.25, 659.25, 783.99, 1046.5].forEach(fr => {
        const cg = c.createGain(); cg.connect(master!); env(cg, t + 0.05, 0.12, 0.02, 0.2, 1.4);
        osc(c, 'triangle', fr, t + 0.05, 1.8, cg);
      });
    },
    chime(c, t) {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((fr, i) => {
        const g = c.createGain(); g.connect(master!);
        const at = t + i * 0.12; env(g, at, 0.2, 0.01, 0.05, 1.6);
        osc(c, 'triangle', fr, at, 1.8, g); osc(c, 'sine', fr * 2, at, 1.8, g);
      });
    },
    tick(c, t) {
      const g = c.createGain(); g.connect(master!); env(g, t, 0.15, 0.005, 0, 0.12);
      osc(c, 'triangle', 880, t, 0.2, g);
    },
  };

  return {
    play(name) {
      const c = ensure();
      if (!c || muted || c.state !== 'running') return;     // se l'audio è bloccato, il suono si salta: niente code in ritardo
      try { sfx[name](c, c.currentTime + 0.02); } catch { /* audio non disponibile */ }
    },
    async resume() {
      const c = ensure();
      if (c && c.state === 'suspended') { try { await c.resume(); } catch { /* ignora */ } }
    },
    setMuted(m) { muted = m; if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05); },
    get suspended() { return !!ctx && ctx.state === 'suspended' || (!ctx && !!Ctor); },
    dispose() { if (ctx) { void ctx.close().catch(() => undefined); ctx = null; } },
  };
}
