// Edge Function: change-username
//
// Cambia lo username dell'utente loggato. Serve una funzione server perché l'accesso usa
// un'email fittizia derivata dallo username (<username>@users.fantaprof.app): cambiando lo
// username va aggiornata anche l'email di Supabase Auth, cosa possibile solo con la service role.
//
// POST { username }  con il JWT dell'utente nell'header Authorization.
// Regole: 3-20 caratteri [A-Za-z0-9_], unico (senza distinguere maiuscole), massimo una volta ogni 30 giorni.
//
// Deploy:  supabase functions deploy change-username      (verifica JWT attiva: è il default)

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const COOLDOWN_DAYS = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

const toEmail = (u: string) => `${u.trim().toLowerCase()}@users.fantaprof.app`;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (!jwt) return json({ error: 'Non autenticato' }, 401);

  let username = '';
  try { username = String((await req.json()).username ?? '').trim(); } catch { return json({ error: 'Richiesta non valida' }, 400); }
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return json({ error: 'Username non valido: 3-20 caratteri tra lettere, numeri e _.' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: caller, error: cErr } = await admin.auth.getUser(jwt);
  if (cErr || !caller?.user) return json({ error: 'Sessione non valida' }, 401);
  const uid = caller.user.id;

  const { data: me } = await admin.from('profiles').select('username, username_changed_at, banned_until').eq('id', uid).maybeSingle();
  if (!me) return json({ error: 'Profilo non trovato' }, 404);
  if (me.banned_until && new Date(me.banned_until).getTime() > Date.now()) return json({ error: 'Account sospeso' }, 403);
  if (String(me.username) === username) return json({ error: 'Questo è già il tuo username.' }, 400);

  if (me.username_changed_at) {
    const next = new Date(me.username_changed_at).getTime() + COOLDOWN_DAYS * 86_400_000;
    if (next > Date.now()) {
      return json({ error: `Puoi cambiare username una volta ogni ${COOLDOWN_DAYS} giorni.`, next_change_at: new Date(next).toISOString() }, 429);
    }
  }

  // Unicità: lo username è citext, quindi il confronto non distingue le maiuscole.
  const { data: taken } = await admin.from('profiles').select('id').eq('username', username).neq('id', uid).maybeSingle();
  if (taken) return json({ error: 'Questo username è già in uso.' }, 409);

  const now = new Date().toISOString();
  const { error: pErr } = await admin.from('profiles').update({ username, username_changed_at: now }).eq('id', uid);
  if (pErr) return json({ error: /duplicate|unique/i.test(pErr.message) ? 'Questo username è già in uso.' : 'Impossibile aggiornare lo username.' }, 409);

  const { error: aErr } = await admin.auth.admin.updateUserById(uid, {
    email: toEmail(username), email_confirm: true, user_metadata: { username },
  });
  if (aErr) {
    // Rollback: il login deve continuare a funzionare con il vecchio username.
    await admin.from('profiles').update({ username: me.username, username_changed_at: me.username_changed_at }).eq('id', uid);
    return json({ error: 'Impossibile aggiornare le credenziali. Nessuna modifica effettuata.' }, 500);
  }

  await admin.from('audit_logs').insert({
    admin_id: null, action: 'username_cambiato', target_type: 'profile', target_id: uid, details: { from: String(me.username), to: username },
  });

  return json({ ok: true, username, next_change_at: new Date(Date.now() + COOLDOWN_DAYS * 86_400_000).toISOString() });
});
