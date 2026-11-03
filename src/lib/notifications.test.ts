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

describe('describeNotification (D)', () => {
  it('risposta in chat porta alla chat della lega', () => {
    const v = describeNotification({ type: 'chat_reply', payload: { league_id: 'L1', from: 'mario' } });
    expect(v.label).toContain('mario');
    expect(v.to).toBe('/leghe/L1/chat');
  });
  it('sondaggio, news e modalità app', () => {
    expect(describeNotification({ type: 'poll_new', payload: { league_id: 'L1', question: 'Gita?' } }).label).toContain('Gita?');
    expect(describeNotification({ type: 'news', payload: { title: 'V2.1' } }).to).toBe('/news');
    expect(describeNotification({ type: 'app_mode', payload: { mode: 'maintenance' } }).label).toMatch(/manutenzione/);
    expect(describeNotification({ type: 'app_mode', payload: { mode: 'normal' } }).label).toMatch(/online/);
  });
});
