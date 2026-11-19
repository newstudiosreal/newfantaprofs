import { BADGES, NAME_FX, SKINS } from './premium';
import type { BadgeRequestStatus, TokenConfig, TokenFind } from './types.token';

/**
 * Premi ottenibili con il Token = gli stessi prodotti di Superadmin → Codici (skin, pacchetti, badge, effetti nome,
 * badge personalizzato, Lega Pro). Nomi ed emoji vengono da lib/premium.ts: nessun secondo catalogo.
 * Le chiavi sono quelle validate dal server (migrazione 009).
 */
export type RewardGroup = 'skin' | 'badge' | 'fx' | 'bundle' | 'custom' | 'pro';
export interface RewardDef { key: string; group: RewardGroup; emoji: string; name: string; desc: string }

export const REWARD_GROUPS: { id: RewardGroup; label: string }[] = [
  { id: 'skin', label: 'Skin' }, { id: 'fx', label: 'Effetti nome' }, { id: 'badge', label: 'Badge' },
  { id: 'bundle', label: 'Pacchetti' }, { id: 'custom', label: 'Badge personalizzato' }, { id: 'pro', label: 'Lega Pro' },
];

export const REWARD_DEFS: RewardDef[] = [
  ...SKINS.filter(s => s.id !== 'default').map(s => ({ key: `skin:${s.id}`, group: 'skin' as const, emoji: s.emoji, name: s.name, desc: 'Colore d\'accento dell\'app' })),
  ...NAME_FX.map(f => ({ key: `name_fx:${f.id}`, group: 'fx' as const, emoji: f.emoji, name: f.name, desc: 'Effetto sul nome della tua squadra' })),
  ...BADGES.map(b => ({ key: `badge:${b.id}`, group: 'badge' as const, emoji: b.emoji, name: b.name, desc: b.desc })),
  { key: 'skin_bundle', group: 'bundle', emoji: '🎨', name: 'Pacchetto skin', desc: 'Tutte le skin' },
  { key: 'badge_bundle', group: 'bundle', emoji: '🏅', name: 'Pacchetto badge', desc: 'Tutti i badge' },
  { key: 'custom_badge', group: 'custom', emoji: '✍️', name: 'Badge personalizzato', desc: 'Scrivi tu il testo: lo approva il SuperAdmin' },
  { key: 'pro', group: 'pro', emoji: '⚡', name: 'Lega Pro', desc: 'Sblocca le funzioni Pro per una tua lega' },
];

export const rewardDef = (key: string): RewardDef | undefined => REWARD_DEFS.find(r => r.key === key);
export const rewardLabel = (key: string | null | undefined): string => {
  if (!key) return '—';
  const d = rewardDef(key);
  return d ? `${d.emoji} ${d.name}` : key;
};
export const isRewardKey = (key: string): boolean => REWARD_DEFS.some(r => r.key === key);

export const BADGE_TEXT_MIN = 2;
export const BADGE_TEXT_MAX = 30;
export const BADGE_DESC_MAX = 200;

/** Stessi limiti del server (clean_text 2-30, niente < > né caratteri di controllo). Null = valido. */
export function badgeTextError(text: string): string | null {
  const t = text.trim();
  if (t.length < BADGE_TEXT_MIN) return `Scrivi almeno ${BADGE_TEXT_MIN} caratteri`;
  if (t.length > BADGE_TEXT_MAX) return `Massimo ${BADGE_TEXT_MAX} caratteri`;
  if (/[<>\u0000-\u001F\u007F]/.test(t)) return 'Il testo contiene caratteri non consentiti';
  return null;
}

/** Controlli sulla configurazione prima di inviarla (il server li ripete). Null = valida. */
export function configError(c: Pick<TokenConfig, 'probability' | 'visits_required' | 'min_gap_minutes'>): string | null {
  if (!Number.isFinite(c.probability) || c.probability < 0 || c.probability > 100) return 'La probabilità deve essere tra 0 e 100';
  if (!Number.isInteger(c.visits_required) || c.visits_required < 1 || c.visits_required > 1000) return 'Gli accessi richiesti devono essere un intero tra 1 e 1000';
  if (!Number.isInteger(c.min_gap_minutes) || c.min_gap_minutes < 0 || c.min_gap_minutes > 1440) return 'L\'intervallo deve essere un intero tra 0 e 1440 minuti';
  return null;
}

export function findStatusLabel(f: Pick<TokenFind, 'status' | 'reward_key'>): string {
  if (f.status === 'available') return 'Da riscattare';
  if (f.status === 'badge_pending') return 'Badge in attesa di approvazione';
  return `Riscattato: ${rewardLabel(f.reward_key)}`;
}

export const REQUEST_STATUS_LABEL: Record<BadgeRequestStatus, string> = {
  pending: '🟡 In attesa', approved: '🟢 Approvato', rejected: '🔴 Rifiutato', cancelled: '⚫ Annullato',
};

/** Il client avvisa le altre parti dell'app (chip, profilo) che lo stato del Token è cambiato. */
export const TOKEN_CHANGED_EVENT = 'fp-token-changed';
export const notifyTokenChanged = () => window.dispatchEvent(new Event(TOKEN_CHANGED_EVENT));
