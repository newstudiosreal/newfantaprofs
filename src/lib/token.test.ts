import { describe, expect, it } from 'vitest';
import { BADGES, NAME_FX, SKINS } from './premium';
import { badgeTextError, configError, findStatusLabel, isRewardKey, REWARD_DEFS, rewardLabel } from './token';

describe('catalogo premi del Token', () => {
  it('copre tutti i prodotti di Codici senza inventarne altri', () => {
    const keys = REWARD_DEFS.map(r => r.key);
    for (const s of SKINS.filter(x => x.id !== 'default')) expect(keys).toContain(`skin:${s.id}`);
    for (const b of BADGES) expect(keys).toContain(`badge:${b.id}`);
    for (const f of NAME_FX) expect(keys).toContain(`name_fx:${f.id}`);
    for (const k of ['skin_bundle', 'badge_bundle', 'custom_badge', 'pro']) expect(keys).toContain(k);
    expect(keys.length).toBe(new Set(keys).size);
    expect(keys.length).toBe(SKINS.length - 1 + BADGES.length + NAME_FX.length + 4);
  });
  it('etichette e validazione chiavi', () => {
    expect(rewardLabel('skin:rosso')).toContain('Rosso Fuoco');
    expect(rewardLabel('boh')).toBe('boh');
    expect(rewardLabel(null)).toBe('—');
    expect(isRewardKey('pro')).toBe(true);
    expect(isRewardKey('skin:default')).toBe(false);
  });
});

describe('badge personalizzato', () => {
  it('rispetta i limiti del server (2-30, niente < >)', () => {
    expect(badgeTextError('a')).toMatch(/almeno/);
    expect(badgeTextError('Re del 5B')).toBeNull();
    expect(badgeTextError('x'.repeat(31))).toMatch(/Massimo/);
    expect(badgeTextError('<b>ciao</b>')).toMatch(/non consentiti/);
    expect(badgeTextError('  ab  ')).toBeNull();
  });
});

describe('configurazione', () => {
  const ok = { probability: 11, visits_required: 5, min_gap_minutes: 30 };
  it('accetta valori validi e rifiuta quelli fuori scala', () => {
    expect(configError(ok)).toBeNull();
    expect(configError({ ...ok, probability: 100.1 })).not.toBeNull();
    expect(configError({ ...ok, probability: Number.NaN })).not.toBeNull();
    expect(configError({ ...ok, visits_required: 0 })).not.toBeNull();
    expect(configError({ ...ok, visits_required: 2.5 })).not.toBeNull();
    expect(configError({ ...ok, min_gap_minutes: -1 })).not.toBeNull();
  });
});

describe('stato dei ritrovamenti', () => {
  it('descrive i tre stati', () => {
    expect(findStatusLabel({ status: 'available', reward_key: null })).toBe('Da riscattare');
    expect(findStatusLabel({ status: 'badge_pending', reward_key: null })).toMatch(/attesa/);
    expect(findStatusLabel({ status: 'redeemed', reward_key: 'badge:og' })).toContain('OG');
  });
});
