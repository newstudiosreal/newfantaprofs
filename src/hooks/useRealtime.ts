import { useEffect, useRef } from 'react';
import { isConfigured, supabase } from '@/lib/supabase';

export interface RealtimeTarget { table: string; /** es. `league_id=eq.<uuid>` o `user_id=eq.<uuid>` */ filter?: string }

interface Options {
  /** Chiamata (con debounce) a ogni INSERT/UPDATE/DELETE sulle tabelle indicate. */
  onChange: () => void;
  debounceMs?: number;
  enabled?: boolean;
}

const MAX_RETRIES = 6;

/**
 * Ascolta le modifiche Postgres via Supabase Realtime (le RLS valgono anche qui).
 * Ogni tabella ha il suo canale: se una non è pubblicata o non esiste, le altre continuano a funzionare.
 * Se un canale cade si ricollega con backoff (poi smette); chi usa l'hook tiene comunque un polling lento
 * come rete di sicurezza, quindi l'app funziona anche con Realtime spento sul progetto.
 */
export function useRealtime(targets: (RealtimeTarget | string)[], { onChange, debounceMs = 500, enabled = true }: Options): void {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = JSON.stringify(targets);

  useEffect(() => {
    if (!isConfigured || !enabled) return;
    const list: RealtimeTarget[] = (JSON.parse(key) as (RealtimeTarget | string)[]).map(t => (typeof t === 'string' ? { table: t } : t));
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanups: (() => void)[] = [];

    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!dead) cb.current(); }, debounceMs);
    };

    for (const t of list) {
      let attempt = 0;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let ch: ReturnType<typeof supabase.channel> | null = null;
      const connect = () => {
        if (dead) return;
        const channel = supabase.channel(`rt:${t.table}:${Math.random().toString(36).slice(2)}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: t.table, ...(t.filter ? { filter: t.filter } : {}) }, fire);
        ch = channel;
        channel.subscribe(status => {
          if (dead) return;
          if (status === 'SUBSCRIBED') { attempt = 0; return; }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            void supabase.removeChannel(channel);
            if (ch === channel) ch = null;
            if (attempt >= MAX_RETRIES) return;   // si arrende: resta il polling
            clearTimeout(retry);
            retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++));
          }
        });
      };
      connect();
      cleanups.push(() => { clearTimeout(retry); if (ch) void supabase.removeChannel(ch); });
    }

    // Al ritorno sulla scheda recupera quanto perso mentre era in background.
    const onVisible = () => { if (!document.hidden) fire(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      dead = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      cleanups.forEach(c => c());
    };
  }, [key, debounceMs, enabled]);
}
