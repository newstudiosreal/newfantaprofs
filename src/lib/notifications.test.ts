import { describe, expect, it } from 'vitest';
import { describeNotification } from './notifications';

describe('describeNotification (C)', () => {
  it('proposta nuova porta alla scheda proposte', () => {
    const v = describeNotification({ type: 'proposal_new', payload: { league_id: 'L1', event: 'È assente' } });
    expect(v.label).toContain('È assente');
    expect(v.to).toBe('/leghe/L1/proposte');
  });
  it('approvata e rifiutata', () => {
    expect(describeNotification({ type: 'proposal_approved', payload: { league_id: 'L1' } }).label).toMatch(/approvata/);
    expect(describeNotification({ type: 'proposal_rejected', payload: { league_id: 'L1' } }).label).toMatch(/rifiutata/);
  });
  it('tipo sconosciuto → etichetta generica senza link', () => {
    expect(describeNotification({ type: 'boh', payload: {} })).toEqual({ label: '🔔 Notifica' });
  });
});
