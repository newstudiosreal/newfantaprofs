import { describe, expect, it } from 'vitest';
import { crossProduct } from './api.social';

describe('crossProduct', () => {
  it('combina professori × eventi', () => {
    expect(crossProduct(['p1', 'p2'], ['a', 'b'])).toEqual([
      { professor_id: 'p1', event_key: 'a' }, { professor_id: 'p1', event_key: 'b' },
      { professor_id: 'p2', event_key: 'a' }, { professor_id: 'p2', event_key: 'b' },
    ]);
  });
  it('vuoto se manca una delle due liste', () => {
    expect(crossProduct([], ['a'])).toEqual([]);
    expect(crossProduct(['p'], [])).toEqual([]);
  });
});
