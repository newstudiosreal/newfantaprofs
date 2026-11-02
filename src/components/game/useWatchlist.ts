import { useCallback, useMemo } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { explain } from '@/lib/errors';
import { listWatchlist, toggleWatch } from '@/lib/api.game';

/** Preferiti dell'utente nella lega: insieme degli id e azione per aggiungere/togliere. */
export function useWatchlist(leagueId: string, userId: string) {
  const { data, reload } = useAsync(() => listWatchlist(userId, leagueId), [leagueId, userId]);
  const toast = useToast();
  const ids = useMemo(() => new Set((data ?? []).map(w => w.professor_id)), [data]);
  const toggle = useCallback(async (profId: string) => {
    try {
      const on = await toggleWatch(profId);
      toast.ok(on ? 'Aggiunto ai preferiti: ti avviso quando va in vendita' : 'Rimosso dai preferiti');
      await reload();
    } catch (e) { toast.error(explain(e)); }
  }, [reload, toast]);
  return { ids, toggle, reload };
}
