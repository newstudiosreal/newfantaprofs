// Edge Function: recover-password
//
// Recupero password SENZA email: l'utente usa il codice di recupero (XXXX-XXXX-XXXX) mostrato
// alla registrazione / in Profilo → Sicurezza. Gli utenti accedono con username, quindi
// resetPasswordForEmail non avrebbe nessun destinatario reale.
//
// Flusso: POST { username, code, password }
//  1. recovery_verify (RPC solo service_role): controlla l'hash bcrypt, blocca 15 minuti dopo 5 errori
//  2. se valido: imposta la nuova password con l'Admin API
//  3. recovery_rotate: invalida il codice usato e ne genera uno nuovo, restituito UNA volta sola
//
// Risposte volutamente generiche: non si capisce se l'utente esiste o se il codice era sbagliato.
//
// Deploy (la funzione è chiamata da utenti NON loggati → senza verifica JWT):
//   supabase functions deploy recover-password --no-verify-jwt
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono già disponibili di default nelle Edge Function.

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

const FAIL = 'Username o codice di recupero non validi, oppure troppi tentativi: riprova tra 15 minuti.';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

  let username = '', code = '', password = '';
  try {
    const b = await req.json();
    username = String(b.username ?? '').trim();
    code = String(b.code ?? '').trim();
    password = String(b.password ?? '');
  } catch {
    return json({ error: 'Richiesta non valida' }, 400);
  }
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username) || code.length < 8 || code.length > 40) return json({ error: FAIL }, 400);
  if (password.length < 6 || password.length > 72) return json({ error: 'La password deve avere tra 6 e 72 caratteri.' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: userId, error: vErr } = await admin.rpc('recovery_verify', { p_username: username, p_code: code });
  if (vErr) return json({ error: 'Servizio momentaneamente non disponibile' }, 500);
  if (!userId) return json({ error: FAIL }, 400);

  const { error: updErr } = await admin.auth.admin.updateUserById(userId as string, { password });
  if (updErr) return json({ error: 'Impossibile aggiornare la password. Riprova.' }, 500);

  const { data: newCode, error: rErr } = await admin.rpc('recovery_rotate', { p_user: userId });
  if (rErr || !newCode) {
    // La password è già cambiata: l'utente può accedere, ma non ha un nuovo codice. Lo rigenera da Profilo.
    return json({ ok: true, new_code: null });
  }
  return json({ ok: true, new_code: newCode });
});
