import { describe, expect, it } from 'vitest';
import type { Place } from '../shared/types';
import { computeProgress } from './progress';

const mk = (id: string, o: Partial<Place>): Place => ({
  id, nameSr: id, kind: 'culture', tier: 1, designations: [], lat: 0, lon: 0,
  districtId: null, municipalityId: null, inKosovo: false, access: null, ...o,
});

describe('computeProgress', () => {
  const places = [
    mk('t1a', {}), mk('t1b', {}), mk('t4', { tier: 4 }), mk('k2', { tier: 2, inKosovo: true }),
  ];
  const visited = new Set(['t1a', 't4']);
  it('counts tiers 1-3 overall with Kosovo shown', () => {
    const r = computeProgress(places, visited, true);
    expect(r.overall).toEqual({ visited: 1, total: 3 });
    expect(r.byTier[1]).toEqual({ visited: 1, total: 2 });
    expect(r.byTier[2]).toEqual({ visited: 0, total: 1 });
    expect(r.byTier[3]).toEqual({ visited: 0, total: 0 });
    expect(r.byTier[4]).toEqual({ visited: 1, total: 1 });
  });
  it('excludes Kosovo when hidden', () => {
    const r = computeProgress(places, visited, false);
    expect(r.overall).toEqual({ visited: 1, total: 2 });
    expect(r.byTier[2]).toEqual({ visited: 0, total: 0 });
  });
});
