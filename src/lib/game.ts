import type { GameEvent, Professor } from './types';
import type { PeriodScore, TeamForecast, TimelinePoint } from './types.game';
import type { Forecast } from './types';

export type Period = 'today' | 'week' | 'season';

// ── Fuso Europe/Rome ─────────────────────────────────────────────
function romeParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(d)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}
const romeOffsetMs = (d: Date) => {
  const p = romeParts(d);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
};
/** Istante (UTC) della mezzanotte di Roma del giorno y-m-d. */
function romeMidnight(y: number, m: number, d: number): Date {
  let guess = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 3; i++) guess = Date.UTC(y, m - 1, d) - romeOffsetMs(new Date(guess));
  return new Date(guess);
}
export function romeDayStart(now = new Date()): Date {
  const p = romeParts(now);
  return romeMidnight(p.year, p.month, p.day);
}
/** Lunedì (00:00 di Roma) della settimana corrente. */
export function romeWeekStart(now = new Date()): Date {
  const p = romeParts(now);
  const dow = (new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - dow));
  return romeMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
}
/** Data (yyyy-mm-dd) del lunedì corrente: stessa chiave di forecasts.week_start. */
export function weekStartKey(now = new Date()): string {
  const p = romeParts(now);
  const dow = (new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7;
  return new Date(Date.UTC(p.year, p.month - 1, p.day - dow)).toISOString().slice(0, 10);
}
export function periodStart(period: Period, now = new Date()): Date | null {
  return period === 'today' ? romeDayStart(now) : period === 'week' ? romeWeekStart(now) : null;
}

// ── Classifica e variazioni ──────────────────────────────────────
/** Variazione di posizione: positiva = salita. Le squadre senza dato precedente non hanno variazione. */
export function rankDeltas(prev: PeriodScore[], curr: PeriodScore[]): Record<string, number> {
  const before = new Map(prev.map((s, i) => [s.team_id, i + 1]));
  const out: Record<string, number> = {};
  curr.forEach((s, i) => {
    const b = before.get(s.team_id);
    out[s.team_id] = b === undefined ? 0 : b - (i + 1);
  });
  return out;
}
export const deltaLabel = (d: number) => (d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : '–');

// ── Grafico andamento ────────────────────────────────────────────
export interface Series { team_id: string; values: number[] }
/** Giorni (yyyy-mm-dd) da `first` a `last` inclusi. */
export function dayRange(first: string, last: string): string[] {
  const out: string[] = [];
  const d = new Date(`${first}T00:00:00Z`); const end = new Date(`${last}T00:00:00Z`);
  while (d <= end && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
/** Serie cumulative per squadra su un asse giorni continuo. */
export function cumulativeSeries(points: TimelinePoint[], days: string[], teamIds: string[]): Series[] {
  const byTeam = new Map<string, Map<string, number>>();
  for (const p of points) {
    const m = byTeam.get(p.team_id) ?? new Map<string, number>();
    m.set(p.day, (m.get(p.day) ?? 0) + p.pts); byTeam.set(p.team_id, m);
  }
  return teamIds.map(id => {
    let acc = 0;
    return { team_id: id, values: days.map(d => (acc += byTeam.get(id)?.get(d) ?? 0)) };
  });
}
/** Le 5 squadre con più punti finali + la mia, se non è già tra loro. */
export function chartTeams(points: TimelinePoint[], meTeamId: string | undefined, n = 5): string[] {
  const tot = new Map<string, number>();
  for (const p of points) tot.set(p.team_id, (tot.get(p.team_id) ?? 0) + p.pts);
  const top = [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
  if (meTeamId && !top.includes(meTeamId) && tot.has(meTeamId)) top.push(meTeamId);
  return top;
}
export function linePath(values: number[], w: number, h: number, min: number, max: number, pad = 0): string {
  if (!values.length) return '';
  const span = max - min || 1;
  const x = (i: number) => pad + (values.length === 1 ? (w - 2 * pad) / 2 : (i / (values.length - 1)) * (w - 2 * pad));
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - 2 * pad);
  return values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
}

// ── Professori ───────────────────────────────────────────────────
/** Prof con più punti (bonus/malus/premi) tra gli eventi dati. */
export function topProfessor(events: Pick<GameEvent, 'professor_id' | 'pts' | 'kind'>[]): { professor_id: string; pts: number } | null {
  const tot = new Map<string, number>();
  for (const e of events) {
    if (!e.professor_id || (e.kind !== 'bm' && e.kind !== 'premio')) continue;
    tot.set(e.professor_id, (tot.get(e.professor_id) ?? 0) + e.pts);
  }
  let best: { professor_id: string; pts: number } | null = null;
  for (const [professor_id, pts] of tot) if (pts > 0 && (!best || pts > best.pts)) best = { professor_id, pts };
  return best;
}

export type ProfSort = 'punti' | 'nome' | 'costo';
export interface ProfFilter { q: string; subject: string; cost: 'all' | 'low' | 'mid' | 'high'; owned: 'all' | 'owned' | 'free'; sort: ProfSort }
export const COST_BANDS: Record<ProfFilter['cost'], [number, number]> = { all: [0, 999], low: [1, 10], mid: [11, 20], high: [21, 999] };

export function filterProfessors(profs: Professor[], pts: Record<string, number>, owners: Record<string, number>, f: ProfFilter): Professor[] {
  const s = f.q.trim().toLowerCase();
  const [lo, hi] = COST_BANDS[f.cost];
  return profs
    .filter(p => (!s || p.name.toLowerCase().includes(s) || p.subject.toLowerCase().includes(s))
      && (!f.subject || p.subject === f.subject)
      && p.cost >= lo && p.cost <= hi
      && (f.owned === 'all' || (f.owned === 'owned') === ((owners[p.id] ?? 0) > 0)))
    .sort((a, b) => f.sort === 'nome' ? a.name.localeCompare(b.name, 'it')
      : f.sort === 'costo' ? b.cost - a.cost || a.name.localeCompare(b.name, 'it')
      : (pts[b.id] ?? 0) - (pts[a.id] ?? 0) || a.name.localeCompare(b.name, 'it'));
}

// ── Pronostici ───────────────────────────────────────────────────
/** Serie corrente di pronostici giusti consecutivi (settimane adiacenti, dalla più recente chiusa). */
export function forecastStreak(rows: Pick<Forecast, 'week_start' | 'resolved' | 'won'>[]): number {
  const done = rows.filter(r => r.resolved).sort((a, b) => b.week_start.localeCompare(a.week_start));
  let streak = 0; let prev: number | null = null;
  for (const r of done) {
    const t = new Date(`${r.week_start}T00:00:00Z`).getTime();
    if (r.won !== true || (prev !== null && prev - t !== 7 * 86_400_000)) break;
    streak += 1; prev = t;
  }
  return streak;
}
export const teamForecastWins = (rows: Pick<TeamForecast, 'won'>[]) => rows.filter(r => r.won === true).length;

/** Percentuale 0-100 di avanzamento di una missione. */
export const progressPct = (progress: number, target: number) => (target <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((progress / target) * 100))));
