/** Trasforma qualunque errore (Supabase, rete, JS) in un messaggio leggibile per l'utente. */
export function explain(err: unknown): string {
  const e = err as { message?: string; code?: string; status?: number; details?: string } | null;
  const msg = e?.message ?? '';
  if (!e) return 'Errore sconosciuto';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Connessione assente o server non raggiungibile. Riprova tra poco.';
  if (/JWT expired|invalid.*jwt|not authenticated|28000/i.test(msg + (e.code ?? ''))) return 'Sessione scaduta: accedi di nuovo.';
  if (/Invalid login credentials/i.test(msg)) return 'Username o password errati.';
  if (/User already registered|already been registered/i.test(msg)) return 'Questo username è già in uso.';
  if (/duplicate key|profiles_username/i.test(msg)) return 'Questo username è già in uso.';
  if (/profiles_username_check/i.test(msg)) return 'Username non valido: 3-20 caratteri tra lettere, numeri e _.';
  if (/Password should be at least/i.test(msg)) return 'La password deve avere almeno 6 caratteri.';
  if (/rate limit|too many/i.test(msg)) return 'Troppi tentativi ravvicinati. Attendi un minuto.';
  if (/permission denied|row-level security/i.test(msg)) return 'Non hai i permessi per questa azione.';
  return msg || 'Qualcosa è andato storto.';
}

/** True se il server chiede di scegliere quale prof eliminare (squadra già a 4). */
export function needsDrop(err: unknown): boolean {
  const e = err as { hint?: string; message?: string } | null;
  return e?.hint === 'NEED_DROP' || /scegli quale eliminare/i.test(e?.message ?? '');
}
