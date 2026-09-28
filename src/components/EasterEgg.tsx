import { useEffect, useRef } from 'react';

const VIDEO_SRC = '/easter-egg.mp4';

/** Sorpresa: appare ogni volta che si apre la pagina News, si chiude da sola a fine video o con la X/Esc. */
export function EasterEgg({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Alcuni browser bloccano l'audio in autoplay: se succede, riprova in muto.
    v.play().catch(() => { v.muted = true; void v.play(); });
  }, []);

  return (
    <div className="egg-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="egg-box" role="dialog" aria-modal="true" aria-label="Sorpresa">
        <button className="egg-close" onClick={onClose} aria-label="Chiudi">✕</button>
        <video ref={ref} className="egg-video" src={VIDEO_SRC} playsInline autoPlay onEnded={onClose} />
      </div>
    </div>
  );
}
