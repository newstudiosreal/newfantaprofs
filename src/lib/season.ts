export const SEASON_DAYS = 30;
export const PAUSE_DAYS = 3;
export const CYCLE_DAYS = SEASON_DAYS + PAUSE_DAYS;
export const TEAM_BUDGET = 50;
export const TEAM_MAX_PROFS = 4;

export type SeasonState = 'active' | 'pause' | 'ended';
export interface SeasonInfo {
  state: SeasonState;
  /** Comodo per i vecchi usi: true solo con stagione in corso. */
  active: boolean;
  /** Giorni alla fine (active), all'inizio (pause); 0 se ended. */
  left: number;
  /** Numero della stagione corrente (o imminente, in pausa). */
  num: number;
}

/**
 * La stagione dura 30 giorni da `season_start`. Il server, alla chiusura, archivia la classifica,
 * azzera i punti, svuota le squadre e sposta `season_start` 33 giorni dopo: nei 3 giorni di pausa
 * `season_start` è nel futuro. Se la lega è in modalità manuale, dopo i 30 giorni resta "ended"
 * finché un admin non la chiude.
 */
export function seasonInfo(seasonStartIso: string, num: number, now = Date.now()): SeasonInfo {
  const days = (now - new Date(seasonStartIso).getTime()) / 86_400_000;
  if (days < 0) return { state: 'pause', active: false, left: Math.ceil(-days), num };
  if (days >= SEASON_DAYS) return { state: 'ended', active: false, left: 0, num };
  return { state: 'active', active: true, left: Math.ceil(SEASON_DAYS - days), num };
}

/** Testo breve per badge e intestazioni. */
export function seasonLabel(s: SeasonInfo): string {
  if (s.state === 'active') return `Stagione ${s.num} · ${s.left}g`;
  if (s.state === 'pause') return `Pausa · ${s.left}g al via`;
  return `Stagione ${s.num} finita`;
}

/** True se una selezione di professori rispetta budget (50 crediti) e limite (4). */
export function validateSelection(costs: number[]): string | null {
  if (costs.length === 0) return 'Scegli almeno un professore';
  if (costs.length > TEAM_MAX_PROFS) return `Massimo ${TEAM_MAX_PROFS} professori`;
  const spent = costs.reduce((a, b) => a + b, 0);
  if (spent > TEAM_BUDGET) return `Budget superato (${spent}/${TEAM_BUDGET} crediti)`;
  return null;
}
