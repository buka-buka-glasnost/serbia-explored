import { describe, expect, it } from 'vitest';
import type { Place } from '../src/shared/types';
import { applyOverrides } from './overrides';

const place = (id: string, extra: Partial<Place> = {}): Place => ({
  id, nameSr: id, kind: 'culture', tier: 2, designations: ['heritage_exceptional'],
  lat: 44, lon: 21, districtId: null, municipalityId: null, inKosovo: false, access: null, ...extra,
});

describe('applyOverrides', () => {
  it('patches, adds and removes', () => {
    const added = place('x-hut');
    const out = applyOverrides([place('Q1'), place('Q2')], {
      places: { Q1: { access: 'hike_boat' } }, added: [added], removed: ['Q2'],
    });
    expect(out.map((p) => p.id)).toEqual(['Q1', 'x-hut']);
    expect(out[0].access).toBe('hike_boat');
  });

  it('a hand-set access replaces an estimate and clears the estimated flag', () => {
    const out = applyOverrides(
      [place('Q1', { access: 'door', accessEstimated: true }), place('Q2', { access: 'rough', accessEstimated: true })],
      { places: { Q1: { access: 'hike_boat' }, Q2: { tier: 3 } }, added: [], removed: [] },
    );
    expect(out[0]).toMatchObject({ access: 'hike_boat' });
    expect(out[0].accessEstimated).toBeUndefined();
    expect(out[1]).toMatchObject({ access: 'rough', accessEstimated: true });
  });

  it('throws naming an unknown patched id', () => {
    expect(() => applyOverrides([place('Q1')], { places: { Q999: {} }, added: [], removed: [] }))
      .toThrow(/Q999/);
  });

  it('throws naming an unknown removed id', () => {
    expect(() => applyOverrides([place('Q1')], { places: {}, added: [], removed: ['Q888'] }))
      .toThrow(/Q888/);
  });
});
