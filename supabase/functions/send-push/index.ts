// Edge Function: send-push
//
// Invia una notifica push (Web Push) quando nasce una riga in public.notifications.
//
// Configurazione (una tantum):
//   1. Genera le chiavi VAPID:   npx web-push generate-vapid-keys
//   2. Secrets della funzione:
//        supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@esempio.it WEBHOOK_SECRET=<stringa-casuale-lunga>
//      (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono già disponibili per le Edge Function.)
//   3. Deploy:  supabase functions deploy send-push --no-verify-jwt
//      (--no-verify-jwt: la chiamata arriva dal Database Webhook, non da un utente; la protegge WEBHOOK_SECRET.)
//   4. Dashboard Supabase → Database → Webhooks → nuovo webhook:
//        tabella public.notifications, evento INSERT, tipo "Supabase Edge Functions" → send-push,
//        header aggiuntivo  x-webhook-secret: <lo stesso WEBHOOK_SECRET>
//   5. Nel front-end imposta VITE_VAPID_PUBLIC_KEY con la chiave pubblica (stessa di VAPID_PUBLIC_KEY).

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import webpush from 'npm:web-push@3.6.7';

interface NotificationRecord { user_id: string; type: string; payload?: Record<string, unknown> | null }

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Tipo di notifica → testo in italiano e pagina da aprire (stessi tipi di src/lib/notifications.ts). */
function describe(type: string, p: Record<string, unknown>): { title: string; body: string; url: string } {
  const lg = (section = '') => (str(p.league_id) ? `/leghe/${str(p.league_id)}${section ? `/${section}` : ''}` : '/');
  switch (type) {
    case 'dm': return { title: '💬 Nuovo messaggio', body: 'Hai un nuovo messaggio privato.', url: str(p.conversation_id) ? `/community/messaggi/${str(p.conversation_id)}` : '/community' };
    case 'proposal_new': return { title: '📝 Nuova proposta', body: str(p.event) ? `Da valutare: ${str(p.event)}${str(p.professor) ? ` (${str(p.professor)})` : ''}` : 'Un giocatore ha proposto un evento.', url: lg('proposte') };
    case 'proposal_approved': return { title: '✅ Proposta approvata', body: str(p.event) || 'I punti sono stati assegnati.', url: lg('proposte') };
    case 'proposal_rejected': return { title: '🙅 Proposta rifiutata', body: str(p.event) || 'L\'admin non l\'ha approvata.', url: lg('proposte') };
    case 'trade_proposed': return { title: '🔁 Nuova proposta di scambio', body: 'Qualcuno vuole scambiare un professore con te.', url: lg('scambi') };
    case 'trade_accepted': return { title: '✅ Scambio accettato', body: 'Il tuo scambio è andato a buon fine.', url: lg('scambi') };
    case 'trade_rejected': return { title: '❌ Scambio rifiutato', body: 'La tua proposta di scambio è stata rifiutata.', url: lg('scambi') };
    case 'trade_countered': return { title: '↩️ Controfferta ricevuta', body: 'Hai ricevuto una controfferta sul tuo scambio.', url: lg('scambi') };
    case 'outbid': return { title: '📈 Rilancio superato', body: str(p.amount) ? `Ora l'offerta è a ${str(p.amount)} pt.` : 'Qualcuno ha rilanciato sulla tua asta.', url: lg('mercato') };
    case 'auction_ending': return { title: '⏰ Asta in chiusura', body: 'Un\'asta a cui partecipi sta per chiudersi.', url: lg('mercato') };
    case 'watch_listing': return { title: '⭐ Un tuo preferito è sul mercato', body: 'Controlla il mercato prima che lo prenda qualcun altro.', url: lg('mercato') };
    case 'duel_proposed': return { title: '⚔️ Ti hanno sfidato', body: 'Accetta o rifiuta la sfida.', url: lg('sfide') };
    case 'duel_accepted': return { title: '⚔️ Sfida accettata', body: 'Si parte!', url: lg('sfide') };
    case 'duel_declined': return { title: '🙅 Sfida rifiutata', body: 'L\'avversario ha rifiutato.', url: lg('sfide') };
    case 'duel_finished': return { title: '🏁 Sfida conclusa', body: 'Guarda com\'è finita.', url: lg('sfide') };
    case 'season_closed': return { title: '🏁 Stagione conclusa', body: 'Guarda il podio e rifai la tua squadra.', url: lg('stagioni') };
    case 'chat_reply': return { title: `↩️ ${str(p.from) || 'Qualcuno'} ti ha risposto`, body: str(p.preview) || 'Ha risposto al tuo messaggio in chat.', url: lg('chat') };
    case 'poll_new': return { title: '📊 Nuovo sondaggio', body: str(p.question) || 'Vota nel sondaggio della tua lega.', url: lg('chat') };
    case 'news': return { title: '📰 Novità su FantaProf', body: str(p.title) || 'C\'è una nuova news.', url: '/news' };
    case 'app_mode': return str(p.mode) === 'maintenance'
      ? { title: '🛠️ Manutenzione', body: 'L\'app va in manutenzione: tornerà presto.', url: '/' }
      : str(p.mode) === 'estate'
        ? { title: '☀️ Pausa estiva', body: 'FantaProf va in pausa estiva.', url: '/' }
        : { title: '✅ FantaProf è di nuovo online', body: 'La manutenzione è finita, puoi tornare a giocare.', url: '/' };
    case 'account_sospeso': return { title: '⛔ Account sospeso', body: 'Il tuo account è stato sospeso.', url: '/' };
    case 'account_riattivato': return { title: '✅ Account riattivato', body: 'Puoi tornare a giocare.', url: '/' };
    default: return { title: 'FantaProf', body: 'Hai una nuova notifica.', url: '/' };
  }
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const expected = Deno.env.get('WEBHOOK_SECRET');
  if (!expected || req.headers.get('x-webhook-secret') !== expected) return new Response('Unauthorized', { status: 401 });

  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!pub || !priv || !subject) return new Response('VAPID non configurato', { status: 500 });
  webpush.setVapidDetails(subject, pub, priv);

  let record: NotificationRecord | undefined;
  try { record = ((await req.json()) as { record?: NotificationRecord }).record; } catch { /* body non valido */ }
  if (!record?.user_id || !record.type) return new Response('Payload non valido', { status: 400 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: subs, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', record.user_id);
  if (error) return new Response(error.message, { status: 500 });
  if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });

  const msg = describe(record.type, record.payload ?? {});
  const body = JSON.stringify({ ...msg, tag: record.type });
  let sent = 0;
  const expired: string[] = [];
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 12 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) expired.push(s.id);   // iscrizione scaduta o revocata dal browser
    }
  }));
  if (expired.length) await admin.from('push_subscriptions').delete().in('id', expired);
  return new Response(JSON.stringify({ sent, removed: expired.length }), { status: 200, headers: { 'content-type': 'application/json' } });
});
