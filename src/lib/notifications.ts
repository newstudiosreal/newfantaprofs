import type { AppNotification } from './types';

export interface NotificationView { label: string; to?: string }
type P = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const league = (p: P, section = '') => (s(p.league_id) ? `/leghe/${s(p.league_id)}${section ? `/${section}` : ''}` : undefined);

/**
 * Registro dei tipi di notifica: etichetta e destinazione del click.
 * Ogni area aggiunge le sue voci solo nella propria sezione, per non pestarsi i piedi.
 */
const DEFS: Record<string, (p: P) => NotificationView> = {
  // ── base ──
  dm: p => ({ label: '💬 Nuovo messaggio', to: s(p.conversation_id) ? `/community/messaggi/${s(p.conversation_id)}` : undefined }),
  report_status: () => ({ label: '🚩 Segnalazione aggiornata' }),
  account_sospeso: () => ({ label: '⛔ Account sospeso' }),
  account_riattivato: () => ({ label: '✅ Account riattivato' }),
  // ── stagione e account (A) ──
  season_closed: p => ({ label: `🏁 Stagione ${s(p.season_num) || ''} conclusa: guarda il podio`.replace('  ', ' '), to: league(p, 'stagioni') }),
  recovery_used: () => ({ label: '🔑 Password reimpostata con il codice di recupero', to: '/profilo' }),
  // ── gioco, mercato, scambi (B) ──
  duel_proposed: p => ({ label: '⚔️ Ti hanno sfidato', to: league(p, 'sfide') }),
  duel_accepted: p => ({ label: '⚔️ Sfida accettata: si parte!', to: league(p, 'sfide') }),
  duel_declined: p => ({ label: '🙅 Sfida rifiutata', to: league(p, 'sfide') }),
  duel_finished: p => ({ label: p.draw ? '🤝 Sfida finita in pareggio' : p.won ? '🏆 Hai vinto la sfida! +25 pt' : '😬 Sfida persa', to: league(p, 'sfide') }),
  watch_listing: p => ({ label: p.kind === 'rotation' ? '⭐ Un tuo preferito è in vetrina' : '⭐ Un tuo preferito è in vendita', to: league(p, 'mercato') }),
  outbid: p => ({ label: `📈 Hai perso il rilancio${p.amount ? ` (ora ${String(p.amount)} pt)` : ''}`, to: league(p, 'mercato') }),
  auction_ending: p => ({ label: p.role === 'seller' ? '⏰ La tua asta sta per chiudersi' : '⏰ Un\'asta a cui partecipi sta per chiudersi', to: league(p, 'mercato') }),
  trade_proposed: p => ({ label: '🔁 Nuova proposta di scambio', to: league(p, 'scambi') }),
  trade_accepted: p => ({ label: '✅ Scambio accettato', to: league(p, 'scambi') }),
  trade_rejected: p => ({ label: '❌ Scambio rifiutato', to: league(p, 'scambi') }),
  trade_countered: p => ({ label: '↩️ Controfferta ricevuta', to: league(p, 'scambi') }),
  // ── admin, chat, community (C) ──
  proposal_new: p => ({ label: `📝 Nuova proposta${s(p.event) ? `: ${s(p.event)}` : ''}`, to: league(p, 'proposte') }),
  proposal_approved: p => ({ label: `✅ Proposta approvata${s(p.event) ? `: ${s(p.event)}` : ''}`, to: league(p, 'proposte') }),
  proposal_rejected: p => ({ label: `🙅 Proposta rifiutata${s(p.event) ? `: ${s(p.event)}` : ''}`, to: league(p, 'proposte') }),
};

export function describeNotification(n: Pick<AppNotification, 'type' | 'payload'>): NotificationView {
  const def = DEFS[n.type];
  return def ? def((n.payload ?? {}) as P) : { label: '🔔 Notifica' };
}
