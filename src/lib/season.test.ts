import { describe, expect, it } from 'vitest';
import { seasonInfo, validateSelection } from './season';
import { explain, needsDrop } from './errors';
import { timeLeft, fmtPts } from './format';

describe('seasonInfo', () => {
  const start = '2026-09-01T00:00:00Z';
  const day = 86_400_000;
  it('è attiva nei primi 30 giorni', () => {
    const s = seasonInfo(start, new Date(start).getTime() + 5 * day);
    expect(s.active).toBe(true); expect(s.left).toBe(25); expect(s.num).toBe(1);
  });
  it('entra in pausa dopo 30 giorni', () => {
    const s = seasonInfo(start, new Date(start).getTime() + 31 * day);
    expect(s.active).toBe(false); expect(s.left).toBe(2);
  });
  it('passa alla stagione 2 dopo 33 giorni', () => {
    const s = seasonInfo(start, new Date(start).getTime() + 34 * day);
    expect(s.num).toBe(2); expect(s.active).toBe(true);
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
