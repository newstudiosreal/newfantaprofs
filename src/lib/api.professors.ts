import { supabase } from './supabase';
import { chunk } from './profimport';

export interface ProfChange { id: string; name?: string; subject?: string; cost?: number }

/** Salva le modifiche a professori già inseriti (a gruppi: la funzione server ne accetta fino a 100 per chiamata). */
export async function updateProfessors(leagueId: string, changes: ProfChange[]): Promise<number> {
  let done = 0;
  for (const part of chunk(changes, 100)) {
    const { data, error } = await supabase.rpc('update_professors', { p_league: leagueId, p_changes: part });
    if (error) throw error;
    done += Number(data ?? 0);
  }
  return done;
}
