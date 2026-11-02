import { describe, expect, it } from 'vitest';
import { seasonInfo, seasonLabel, validateSelection } from './season';
import { explain, needsDrop } from './errors';
import { timeLeft, fmtPts } from './format';

describe('seasonInfo', () => {
  const start = '2026-09-01T00:00:00Z';
  const day = 86_400_000;
  const at = (d: number) => new Date(start).getTime() + d * day;
  it('è attiva nei primi 30 giorni', () => {
    const s = seasonInfo(start, 3, at(5));
    expect(s.state).toBe('active'); expect(s.active).toBe(true); expect(s.left).toBe(25); expect(s.num).toBe(3);
  });
  it('è finita dopo 30 giorni se nessuno l\'ha ancora chiusa', () => {
    const s = seasonInfo(start, 1, at(31));
    expect(s.state).toBe('ended'); expect(s.active).toBe(false); expect(s.left).toBe(0);
  });
  it('in pausa quando season_start è nel futuro', () => {
    const s = seasonInfo(start, 2, at(-2));
    expect(s.state).toBe('pause'); expect(s.left).toBe(2); expect(s.num).toBe(2);
  });
  it('label leggibili', () => {
    expect(seasonLabel(seasonInfo(start, 1, at(5)))).toBe('Stagione 1 · 25g');
    expect(seasonLabel(seasonInfo(start, 2, at(-1)))).toMatch(/Pausa/);
    expect(seasonLabel(seasonInfo(start, 1, at(40)))).toMatch(/finita/);
  });
});

describe('validateSelection', () => {
  it('accetta 4 prof entro 50', () => expect(validateSelection([20, 10, 10, 10])).toBeNull());
  it('rifiuta budget superato', () => expect(validateSelection([20, 20, 15])).toMatch(/Budget/));
  it('rifiuta 5 prof', () => expect(validateSelection([1, 1, 1, 1, 1])).toMatch(/Massimo/));
  it('rifiuta selezione vuota', () => expect(validateSelection([])).toMatch(/almeno/));
});

describe('errori e formati', () => {
  it('traduce gli errori più comuni', () => {
    expect(explain({ message: 'Invalid login credentials' })).toMatch(/errati/);
    expect(explain({ message: 'Failed to fetch' })).toMatch(/Connessione/);
    expect(explain({ message: 'JWT expired' })).toMatch(/Sessione scaduta/);
  });
  it('riconosce la richiesta di scelta prof', () => {
    expect(needsDrop({ hint: 'NEED_DROP' })).toBe(true);
    expect(needsDrop({ message: 'altro' })).toBe(false);
  });
  it('formatta tempo e punti', () => {
    expect(timeLeft(new Date(Date.now() - 1000).toISOString())).toBe('scaduto');
    expect(fmtPts(5)).toBe('+5'); expect(fmtPts(-5)).toBe('-5');
  });
});
