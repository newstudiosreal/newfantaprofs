import { createPortal } from 'react-dom';   // aggiungi questo import in cima al file

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  // Portal su document.body: se il modale venisse aperto da dentro un elemento con
  // backdrop-filter/transform/filter (es. la topbar), position:fixed si "incastra"
  // in quel contenitore invece di coprire tutto lo schermo. Il portal lo evita sempre.
  return createPortal(
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Chiudi">✕</Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
