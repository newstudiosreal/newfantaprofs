// Edge Function: admin-reset-password
//
// Perché serve: in questo progetto gli utenti accedono con uno username,
// non con un'email reale (vedi usernameToEmail in src/lib/supabase.ts:
// "<username>@users.fantaprof.app" è fittizia). Questo significa che
// supabase.auth.resetPasswordForEmail() non recapiterebbe nulla a nessuno.
// L'unico modo sicuro per il Superadmin di resettare la password di un
// altro utente è la Auth Admin API, che richiede la service_role key —
// per questo NON può essere una funzione SQL né girare nel browser.
//
// Come funziona:
// 1. Il Superadmin chiama questa funzione autenticato (supabase.functions.invoke
//    inoltra automaticamente il suo JWT nell'header Authorization).
// 2. La funzione verifica con quel JWT chi sta chiamando e controlla, con la
//    service role (bypassa RLS), che sia davvero is_superadmin.
// 3. Genera una password temporanea sicura e la imposta con l'Admin API.
// 4. Registra l'azione in audit_logs e restituisce la password temporanea
//    SOLO nella risposta di questa chiamata: il Superadmin la copia e la
//    comunica all'utente fuori dall'app (non viene salvata in chiaro da
//    nessuna parte). L'utente dovrebbe cambiarla al primo accesso da Profilo.
//
// Deploy (richiede la Supabase CLI):
//   supabase functions deploy admin-reset-password
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_URL=...
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono già disponibili di default
// come variabili d'ambiente per le Edge Function sullo stesso progetto;
// vanno impostate a mano solo se il progetto è diverso.)

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => b.toString(36)).join('').slice(0, 14) + 'A1!';
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer /, '');
  if (!jwt) return json({ error: 'Non autenticato' }, 401);

  let targetUserId: string;
  try {
    ({ userId: targetUserId } = await req.json());
    if (!targetUserId || typeof targetUserId !== 'string') throw new Error();
  } catch {
    return json({ error: 'userId mancante' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Chi sta chiamando? Verifichiamo il JWT con la service role.
  const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !caller?.user) return json({ error: 'Sessione non valida' }, 401);

  const { data: callerProfile } = await admin.from('profiles').select('is_superadmin').eq('id', caller.user.id).maybeSingle();
  if (!callerProfile?.is_superadmin) return json({ error: 'Permesso negato' }, 403);

  const { data: targetProfile } = await admin.from('profiles').select('id, is_superadmin').eq('id', targetUserId).maybeSingle();
  if (!targetProfile) return json({ error: 'Utente non trovato' }, 404);
  if (targetProfile.is_superadmin) return json({ error: 'Non puoi resettare la password di un altro Superadmin' }, 403);

  const tempPassword = randomPassword();
  const { error: updateErr } = await admin.auth.admin.updateUserById(targetUserId, { password: tempPassword });
  if (updateErr) return json({ error: updateErr.message }, 500);

  await admin.from('audit_logs').insert({
    admin_id: caller.user.id,
    action: 'reset_password_eseguito',
    target_type: 'profile',
    target_id: targetUserId,
    details: {},
  });

  return json({ tempPassword });
});
