import { useEffect, useRef } from 'react';

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; g: number; hue: number; spark: boolean }

/**
 * Particelle dorate su canvas a schermo intero.
 * `intensity` (0..1) regola le lucciole ambientali; ogni volta che `burstKey` cambia (e non è 0) parte un'esplosione.
 */
export function TokenParticles({ intensity, burstKey }: { intensity: number; burstKey: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ intensity, parts: [] as P[], w: 0, h: 0, burst: () => undefined as void });
  state.current.intensity = intensity;

  useEffect(() => { if (burstKey) state.current.burst(); }, [burstKey]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const st = state.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      st.w = window.innerWidth; st.h = window.innerHeight;
      cv.width = Math.round(st.w * dpr); cv.height = Math.round(st.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const small = () => st.w < 600;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    st.burst = () => {
      const n = small() ? 110 : 190;
      const cx = st.w / 2, cy = st.h * 0.44;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = rnd(2, small() ? 9 : 13);
        st.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 0, max: rnd(55, 130), size: rnd(1, 3.2), g: 0.07, hue: rnd(38, 52), spark: Math.random() < 0.35 });
      }
    };

    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(2.5, (now - last) / 16.67); last = now;
      ctx.clearRect(0, 0, st.w, st.h);
      // lucciole ambientali che salgono
      const rate = st.intensity * (small() ? 0.45 : 0.9) * dt;
      for (let r = rate; r > 0; r -= 1) {
        if (r < 1 && Math.random() > r) break;
        if (st.parts.length > 420) break;
        const x = rnd(0, st.w);
        st.parts.push({ x, y: st.h + 10, vx: rnd(-0.25, 0.25), vy: -rnd(0.5, 1.9), life: 0, max: rnd(140, 280), size: rnd(0.8, 2.4), g: 0, hue: rnd(40, 50), spark: false });
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = st.parts.length - 1; i >= 0; i--) {
        const p = st.parts[i];
        p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.spark) p.vx *= 0.985;
        const k = p.life / p.max;
        if (k >= 1 || p.y < -20) { st.parts.splice(i, 1); continue; }
        const a = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * (p.spark ? 1 : 0.8);
        ctx.fillStyle = `hsla(${p.hue}, 100%, ${p.spark ? 78 : 62}%, ${a * 0.28})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, 6.283); ctx.fill();
        ctx.fillStyle = `hsla(${p.hue}, 100%, ${p.spark ? 92 : 72}%, ${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); st.parts.length = 0; st.burst = () => undefined; };
  }, []);

  return <canvas ref={ref} className="tk-canvas" aria-hidden="true" />;
}
