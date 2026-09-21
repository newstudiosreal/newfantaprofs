export const SEASON_DAYS = 30;
export const PAUSE_DAYS = 3;
export const CYCLE_DAYS = SEASON_DAYS + PAUSE_DAYS;
export const TEAM_BUDGET = 50;
export const TEAM_MAX_PROFS = 4;

export interface SeasonInfo { active: boolean; left: number; num: number }

/** Stagione di 30 giorni + 3 di pausa, contata dalla data di inizio della lega (regola V1). */
export function seasonInfo(seasonStartIso: string, now = Date.now()): SeasonInfo {
  const days = (now - new Date(seasonStartIso).getTime()) / 86_400_000;
  const pos = ((days % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS;
  const active = pos < SEASON_DAYS;
  return {
    active,
    num: Math.max(1, Math.floor(days / CYCLE_DAYS) + 1),
    left: Math.ceil(active ? SEASON_DAYS - pos : CYCLE_DAYS - pos),
  };
}

/** True se una selezione di professori rispetta budget (50 crediti) e limite (4). */
export function validateSelection(costs: number[]): string | null {
  if (costs.length === 0) return 'Scegli almeno un professore';
  if (costs.length > TEAM_MAX_PROFS) return `Massimo ${TEAM_MAX_PROFS} professori`;
  const spent = costs.reduce((a, b) => a + b, 0);
  if (spent > TEAM_BUDGET) return `Budget superato (${spent}/${TEAM_BUDGET} crediti)`;
  return null;
}
