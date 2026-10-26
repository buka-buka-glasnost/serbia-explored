import { describe, expect, it } from 'vitest';
import type { AreaFC, Place } from '../src/shared/types';
import { checkPlaces } from './checks';

const sq: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
const areas: AreaFC = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: sq,
    properties: { id: 'm-k', level: 'municipality', nameSr: 'K', inKosovo: true } }],
};
const place = (id: string, extra: Partial<Place> = {}): Place => ({
  id, nameSr: 'Име', kind: 'culture', tier: 1, designations: ['heritage_exceptional'],
  lat: 0.5, lon: 0.5, districtId: null, municipalityId: null, inKosovo: false, access: null, ...extra,
});

describe('checkPlaces', () => {
  it('passes clean data', () => {
    expect(checkPlaces([place('Q1')], areas)).toEqual([]);
  });
  it('flags a tier 1-3 place named by its id but not tier 4', () => {
    expect(checkPlaces([place('Q1', { nameSr: 'Q1' })], areas)).toHaveLength(1);
    expect(checkPlaces([place('Q1', { nameSr: 'Q1', tier: 4 })], areas)).toEqual([]);
  });
  it('flags a partOf named by its id', () => {
    expect(checkPlaces([place('Q1', { partOf: { id: 'Q9', nameSr: 'Q9' } })], areas)).toHaveLength(1);
  });
  it('flags inKosovo disagreeing with the municipality', () => {
    expect(checkPlaces([place('Q1', { municipalityId: 'm-k', inKosovo: false })], areas)).toHaveLength(1);
    expect(checkPlaces([place('Q1', { municipalityId: 'm-k', inKosovo: true })], areas)).toEqual([]);
  });
});
