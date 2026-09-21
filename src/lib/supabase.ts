import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** false se le variabili d'ambiente mancano: l'app mostra una schermata di configurazione. */
export const isConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT'));

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** Gli utenti accedono con username: internamente diventa un indirizzo email fittizio. */
export const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@users.fantaprof.app`;

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
