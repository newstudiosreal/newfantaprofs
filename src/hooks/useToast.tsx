import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Tone = 'ok' | 'error' | 'info';
interface ToastItem { id: number; text: string; tone: Tone }
interface ToastApi { ok: (t: string) => void; error: (t: string) => void; info: (t: string) => void }

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((text: string, tone: Tone) => {
    const id = nextId.current++;
    setItems(list => [...list.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems(list => list.filter(i => i.id !== id)), tone === 'error' ? 5000 : 3000);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    ok: t => push(t, 'ok'), error: t => push(t, 'error'), info: t => push(t, 'info'),
  }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map(i => <div key={i.id} className={`toast toast-${i.tone}`}>{i.text}</div>)}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast fuori da ToastProvider');
  return v;
}
