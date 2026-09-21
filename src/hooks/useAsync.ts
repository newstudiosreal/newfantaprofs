import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> { data: T | undefined; error: unknown; loading: boolean; reload: () => Promise<void> }

/**
 * Carica dati asincroni con stato di loading/errore, ricarica manuale e polling opzionale
 * (il polling si ferma quando la scheda è nascosta). Ignora risposte di richieste superate.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts: { interval?: number; enabled?: boolean } = {}): AsyncState<T> {
  const { interval, enabled = true } = opts;
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(enabled);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (silent: boolean) => {
    const my = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const res = await fnRef.current();
      if (my === seq.current) { setData(res); setError(null); }
    } catch (e) {
      if (my === seq.current) setError(e);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    void run(false);
    return () => { seq.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  useEffect(() => {
    if (!interval || !enabled) return;
    const id = setInterval(() => { if (!document.hidden) void run(true); }, interval);
    return () => clearInterval(id);
  }, [interval, enabled, run]);

  const reload = useCallback(() => run(true), [run]);
  return { data, error, loading, reload };
}
