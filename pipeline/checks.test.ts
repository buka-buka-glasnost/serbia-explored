import { describe, expect, it } from 'vitest';
import type { AreaFC, Place } from '../src/shared/types';
import { checkAreaCounts, checkPlaces } from './checks';

const sq: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
const areas: AreaFC = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: sq,
    properties: { id: 'm-k', level: 'municipality', nameSr: 'K', inKosovo: true } }],
};
const place = (id: string, extra: Partial<Place> = {}): Place => ({
  id, nameSr: 'Име', kind: 'culture', tier: 2, designations: ['heritage_exceptional'],
  lat: 0.5, lon: 0.5, districtId: null, municipalityId: null, inKosovo: false, access: null, ...extra,
});

describe('checkPlaces', () => {
  it('passes clean data', () => {
    expect(checkPlaces([place('Q1')], areas)).toEqual([]);
  });
  it('flags a tier 1-3 place named by its id but not tier 4', () => {
    expect(checkPlaces([place('Q1', { nameSr: 'Q1' })], areas)).toHaveLength(1);
    expect(checkPlaces([place('Q1', { nameSr: 'Q1', tier: 4, designations: ['heritage_protected'] })], areas)).toEqual([]);
  });
  it('flags a partOf named by its id', () => {
    expect(checkPlaces([place('Q1', { partOf: { id: 'Q9', nameSr: 'Q9' } })], areas)).toHaveLength(1);
  });
  it('flags inKosovo disagreeing with the municipality', () => {
    expect(checkPlaces([place('Q1', { municipalityId: 'm-k', inKosovo: false })], areas)).toHaveLength(1);
    expect(checkPlaces([place('Q1', { municipalityId: 'm-k', inKosovo: true })], areas)).toEqual([]);
  });
  it('flags a tier that does not follow from the designations', () => {
    const problems = checkPlaces([place('Q1', { tier: 1 })], areas);
    expect(problems).toEqual([expect.stringMatching(/Q1.*tier 1 but its designations give tier 2/)]);
    expect(checkPlaces([place('Q2', { tier: 1, designations: ['unesco_biosphere', 'nature_other'] })], areas)).toEqual([]);
  });
});

describe('checkAreaCounts', () => {
  const feature = (level: 'district' | 'municipality', inKosovo: boolean, i: number): AreaFC['features'][number] => ({
    type: 'Feature', geometry: sq, properties: { id: `${level}-${inKosovo}-${i}`, level, nameSr: 'X', inKosovo },
  });
  const build = (d: number, m: number, kd: number, km: number): AreaFC => ({
    type: 'FeatureCollection',
    features: [
      ...Array.from({ length: d }, (_, i) => feature('district', false, i)),
      ...Array.from({ length: m }, (_, i) => feature('municipality', false, i)),
      ...Array.from({ length: kd }, (_, i) => feature('district', true, i)),
      ...Array.from({ length: km }, (_, i) => feature('municipality', true, i)),
    ],
  });
  it('accepts 25/161 outside Kosovo and 5/29 in the Kosovo scheme', () => {
    expect(checkAreaCounts(build(25, 161, 5, 29))).toEqual([]);
  });
  it('names each count that is off', () => {
    expect(checkAreaCounts(build(25, 160, 5, 30))).toEqual([
      'outside Kosovo: 160 municipalities, expected 161',
      'Kosovo scheme: 30 municipalities, expected 29',
    ]);
  });
});
