import { describe, expect, it } from 'vitest';
import type { AreaProps, Place } from '../shared/types';
import { DEFAULT_SETTINGS, filterPlaces, splitByArea } from './filters';

const mk = (id: string, o: Partial<Place> = {}): Place => ({
  id, nameSr: id, kind: 'culture', tier: 1, designations: [], lat: 0, lon: 0,
  districtId: null, municipalityId: null, inKosovo: false, access: null, ...o,
});

describe('filterPlaces', () => {
  const places = [
    mk('a'), mk('b', { tier: 4 }), mk('c', { kind: 'nature' }), mk('d', { inKosovo: true }),
  ];
  const s = { lang: 'en' as const, ...DEFAULT_SETTINGS };
  it('applies defaults (tiers 1-3, both kinds, Kosovo shown)', () => {
    expect(filterPlaces(places, s, '').map((p) => p.id)).toEqual(['a', 'c', 'd']);
  });
  it('filters by kind, Kosovo, tier and query', () => {
    expect(filterPlaces(places, { ...s, kinds: ['nature'] }, '').map((p) => p.id)).toEqual(['c']);
    expect(filterPlaces(places, { ...s, kosovoShown: false }, '').map((p) => p.id)).toEqual(['a', 'c']);
    expect(filterPlaces(places, { ...s, tiers: [4] }, '').map((p) => p.id)).toEqual(['b']);
    expect(filterPlaces(places, s, 'c').map((p) => p.id)).toEqual(['c']);
  });
});

describe('splitByArea', () => {
  const area: GeoJSON.Feature<GeoJSON.Polygon, AreaProps> = {
    type: 'Feature',
    properties: { id: 'sq', level: 'district', nameSr: 'Квадрат', inKosovo: false },
    geometry: { type: 'Polygon', coordinates: [[[20, 44], [21, 44], [21, 45], [20, 45], [20, 44]]] },
  };
  const eastOf = (km: number) => 21.0 + km / (111.32 * Math.cos((44.5 * Math.PI) / 180));
  it('splits inside, nearby and far', () => {
    const inside = mk('in', { lat: 44.5, lon: 20.5 });
    const near = mk('near', { lat: 44.5, lon: eastOf(5) });
    const far = mk('far', { lat: 44.5, lon: eastOf(30) });
    const r = splitByArea([inside, near, far], area);
    expect(r.inside.map((p) => p.id)).toEqual(['in']);
    expect(r.nearby.map((p) => p.id)).toEqual(['near']);
  });
  it('honours a custom nearby distance', () => {
    const near = mk('near', { lat: 44.5, lon: eastOf(5) });
    expect(splitByArea([near], area, 2).nearby).toEqual([]);
  });
});
