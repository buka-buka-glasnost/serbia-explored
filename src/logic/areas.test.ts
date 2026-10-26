import { describe, expect, it } from 'vitest';
import type { AreaFC, AreaProps } from '../shared/types';
import { makePlace } from '../ui/testPlaces';
import { activeIds, areaAt } from './areas';

const box = (x0: number, y0: number, x1: number, y1: number) => ({
  type: 'Polygon' as const,
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const f = (p: AreaProps, g: ReturnType<typeof box>) => ({ type: 'Feature' as const, properties: p, geometry: g });
const dist = f({ id: 'd-1', level: 'district', nameSr: 'Округ', inKosovo: false }, box(20, 43, 22, 45));
const muni = f({ id: 'm-1', level: 'municipality', nameSr: 'Општина', districtId: 'd-1', inKosovo: false }, box(20, 43, 21, 44));
const areas: AreaFC = { type: 'FeatureCollection', features: [dist, muni] };

describe('areaAt', () => {
  it('returns the municipality at zoom >= 9', () => {
    expect(areaAt(areas, 43.5, 20.5, 9)?.id).toBe('m-1');
  });
  it('returns the district below zoom 9', () => {
    expect(areaAt(areas, 43.5, 20.5, 8)?.id).toBe('d-1');
  });
  it('returns null outside every area of that level', () => {
    expect(areaAt(areas, 44.5, 21.5, 10)).toBeNull();
  });
});

describe('activeIds', () => {
  const inside = makePlace('in', { lat: 43.5, lon: 20.5 });
  const near = makePlace('near', { lat: 43.5, lon: 21.05 });
  const far = makePlace('far', { lat: 43.5, lon: 23 });
  it('is null without an area', () => {
    expect(activeIds([inside], undefined)).toBeNull();
  });
  it('contains inside and nearby places but not far ones', () => {
    const ids = activeIds([inside, near, far], muni)!;
    expect([...ids].sort()).toEqual(['in', 'near']);
  });
});
