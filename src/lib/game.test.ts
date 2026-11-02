import { describe, expect, it } from 'vitest';
import {
  chartTeams, cumulativeSeries, dayRange, deltaLabel, filterProfessors, forecastStreak, linePath, progressPct,
  rankDeltas, romeDayStart, romeWeekStart, topProfessor, weekStartKey,
} from './game';
import type { Professor } from './types';
import type { PeriodScore } from './types.game';

const S = (team_id: string, score: number): PeriodScore => ({ team_id, owner_id: team_id, name: team_id, captain_id: null, score });

describe('rankDeltas', () => {
  it('positivo se sale, negativo se scende, 0 se nuova', () => {
    const prev = [S('a', 10), S('b', 8), S('c', 5)];
    const curr = [S('c', 20), S('a', 12), S('b', 8), S('d', 1)];
    expect(rankDeltas(prev, curr)).toEqual({ c: 2, a: -1, b: -1, d: 0 });
    expect(deltaLabel(2)).toBe('▲2'); expect(deltaLabel(-1)).toBe('▼1'); expect(deltaLabel(0)).toBe('–');
  });
});

describe('fuso Europe/Rome', () => {
  it('mezzanotte di Roma in inverno (UTC+1) e in estate (UTC+2)', () => {
    expect(romeDayStart(new Date('2026-01-15T10:30:00Z')).toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(romeDayStart(new Date('2026-07-15T10:30:00Z')).toISOString()).toBe('2026-07-14T22:00:00.000Z');
    // alle 23:30 UTC di inverno a Roma è già il giorno dopo
    expect(romeDayStart(new Date('2026-01-15T23:30:00Z')).toISOString()).toBe('2026-01-15T23:00:00.000Z');
  });
  it('inizio settimana = lunedì', () => {
    // 2026-11-01 è domenica → lunedì 2026-10-26 (Roma già in ora solare: UTC+1)
    expect(weekStartKey(new Date('2026-11-01T12:00:00Z'))).toBe('2026-10-26');
    expect(romeWeekStart(new Date('2026-11-01T12:00:00Z')).toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(weekStartKey(new Date('2026-10-26T09:00:00Z'))).toBe('2026-10-26');
  });
});

describe('grafico', () => {
  it('serie cumulative su asse continuo', () => {
    const days = dayRange('2026-10-01', '2026-10-04');
    expect(days).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    const pts = [{ day: '2026-10-01', team_id: 'a', pts: 10 }, { day: '2026-10-03', team_id: 'a', pts: -4 }, { day: '2026-10-02', team_id: 'b', pts: 7 }];
    expect(cumulativeSeries(pts, days, ['a', 'b'])).toEqual([{ team_id: 'a', values: [10, 10, 6, 6] }, { team_id: 'b', values: [0, 7, 7, 7] }]);
  });
  it('top 5 + la mia squadra', () => {
    const pts = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({ day: '2026-10-01', team_id: id, pts: 100 - i }));
    expect(chartTeams(pts, 'g')).toEqual(['a', 'b', 'c', 'd', 'e', 'g']);
    expect(chartTeams(pts, 'b')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('linePath gestisce serie vuote e di un solo punto', () => {
    expect(linePath([], 100, 50, 0, 10)).toBe('');
    expect(linePath([5], 100, 50, 0, 10)).toBe('M50.0 25.0');
    expect(linePath([0, 10], 100, 50, 0, 10)).toBe('M0.0 50.0 L100.0 0.0');
  });
});

describe('prof della settimana', () => {
  it('somma solo bonus/malus/premi e ignora i punti negativi', () => {
    const ev = [
      { professor_id: 'x', pts: 30, kind: 'bm' as const }, { professor_id: 'x', pts: -10, kind: 'bm' as const },
      { professor_id: 'y', pts: 25, kind: 'premio' as const }, { professor_id: 'z', pts: 500, kind: 'shop' as const },
    ];
    expect(topProfessor(ev)).toEqual({ professor_id: 'y', pts: 25 });
    expect(topProfessor([{ professor_id: 'x', pts: -5, kind: 'bm' }])).toBeNull();
  });
});

describe('filtri professori', () => {
  const P = (id: string, name: string, subject: string, cost: number): Professor => ({ id, league_id: 'l', name, subject, cost });
  const profs = [P('1', 'Rossi', 'Mat', 8), P('2', 'Bianchi', 'Ita', 15), P('3', 'Verdi', 'Mat', 30)];
  const base = { q: '', subject: '', cost: 'all', owned: 'all', sort: 'punti' } as const;
  const pts = { '1': 5, '2': 50, '3': 20 }; const owners = { '1': 2 };
  it('ordina per punti, nome, costo', () => {
    expect(filterProfessors(profs, pts, owners, base).map(p => p.id)).toEqual(['2', '3', '1']);
    expect(filterProfessors(profs, pts, owners, { ...base, sort: 'nome' }).map(p => p.id)).toEqual(['2', '1', '3']);
    expect(filterProfessors(profs, pts, owners, { ...base, sort: 'costo' }).map(p => p.id)).toEqual(['3', '2', '1']);
  });
  it('filtra per materia, costo e disponibilità', () => {
    expect(filterProfessors(profs, pts, owners, { ...base, subject: 'Mat' }).map(p => p.id)).toEqual(['3', '1']);
    expect(filterProfessors(profs, pts, owners, { ...base, cost: 'mid' }).map(p => p.id)).toEqual(['2']);
    expect(filterProfessors(profs, pts, owners, { ...base, owned: 'owned' }).map(p => p.id)).toEqual(['1']);
    expect(filterProfessors(profs, pts, owners, { ...base, owned: 'free' }).map(p => p.id)).toEqual(['2', '3']);
    expect(filterProfessors(profs, pts, owners, { ...base, q: 'ver' }).map(p => p.id)).toEqual(['3']);
  });
});

describe('serie pronostici', () => {
  const R = (week_start: string, resolved: boolean, won: boolean | null) => ({ week_start, resolved, won });
  it('conta le vittorie consecutive dalla più recente', () => {
    expect(forecastStreak([R('2026-10-05', true, true), R('2026-10-12', true, true), R('2026-10-19', true, true)])).toBe(3);
  });
  it('si interrompe con una sconfitta, un buco o una settimana non risolta', () => {
    expect(forecastStreak([R('2026-10-05', true, true), R('2026-10-12', true, false), R('2026-10-19', true, true)])).toBe(1);
    expect(forecastStreak([R('2026-10-05', true, true), R('2026-10-19', true, true)])).toBe(1);
    expect(forecastStreak([R('2026-10-12', true, true), R('2026-10-19', false, null)])).toBe(1);
    expect(forecastStreak([])).toBe(0);
  });
});

describe('progressPct', () => {
  it('limita tra 0 e 100', () => {
    expect(progressPct(15, 30)).toBe(50); expect(progressPct(99, 30)).toBe(100); expect(progressPct(-3, 30)).toBe(0); expect(progressPct(0, 0)).toBe(100);
  });
});
