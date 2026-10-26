// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AreaFC } from '../src/shared/types';
import {
  assignArea,
  buildKosovoSerbianScheme,
  isInKosovo,
  type KosovoScheme,
} from './areas';
import scheme from './data/kosovo-serbian-scheme.json';

const mini = JSON.parse(
  readFileSync(new URL('./__fixtures__/mini-areas.geojson', import.meta.url), 'utf8'),
) as AreaFC;
const serbian: AreaFC = {
  type: 'FeatureCollection',
  features: mini.features.filter((f) => !f.properties.inKosovo),
};
const osmKosovo: AreaFC = {
  type: 'FeatureCollection',
  features: mini.features.filter((f) => f.properties.inKosovo),
};

describe('assignArea', () => {
  it('assigns a point inside a municipality', () => {
    expect(assignArea({ lat: 44.05, lon: 20.05 }, serbian)).toEqual({
      districtId: 'd-test',
      municipalityId: 'm-a',
    });
  });
  it('snaps a point 500 m outside to the nearest municipality', () => {
    expect(assignArea({ lat: 44.05, lon: 19.9937 }, serbian)).toEqual({
      districtId: 'd-test',
      municipalityId: 'm-a',
    });
  });
  it('returns nulls for a point 50 km away', () => {
    expect(assignArea({ lat: 44.05, lon: 21 }, serbian)).toEqual({
      districtId: null,
      municipalityId: null,
    });
  });
});

describe('buildKosovoSerbianScheme', () => {
  const mini: KosovoScheme = {
    districts: [{ id: 'd-k', nameSr: 'К', nameSq: 'K' }],
    municipalities: [
      { id: 'm-ab', nameSr: 'АБ', nameSq: 'AB', districtId: 'd-k', osmNames: ['Alfa', 'Beta'] },
    ],
  };
  it('merges OSM municipalities into one Serbian municipality and a district', () => {
    const out = buildKosovoSerbianScheme(osmKosovo, mini);
    const m = out.features.filter((f) => f.properties.level === 'municipality');
    const d = out.features.filter((f) => f.properties.level === 'district');
    expect(m).toHaveLength(1);
    expect(m[0].properties).toMatchObject({
      id: 'm-ab', nameSr: 'АБ', districtId: 'd-k', inKosovo: true,
    });
    expect(d).toHaveLength(1);
    expect(d[0].properties).toMatchObject({ id: 'd-k', inKosovo: true });
    expect(assignArea({ lat: 42.05, lon: 21.15 }, out).municipalityId).toBe('m-ab');
  });
  it('throws when an osmName matches nothing', () => {
    const bad: KosovoScheme = {
      ...mini,
      municipalities: [{ ...mini.municipalities[0], osmNames: ['Nope'] }],
    };
    expect(() => buildKosovoSerbianScheme(osmKosovo, bad)).toThrow(/Nope/);
  });
});

describe('isInKosovo', () => {
  it('tests containment in the outline', () => {
    const outline = osmKosovo.features[0];
    expect(isInKosovo({ lat: 42.05, lon: 21.05 }, outline)).toBe(true);
    expect(isInKosovo({ lat: 44, lon: 20 }, outline)).toBe(false);
  });
});

describe('kosovo-serbian-scheme.json', () => {
  const s = scheme as KosovoScheme;
  it('has 5 districts and 29 municipalities', () => {
    expect(s.districts).toHaveLength(5);
    expect(s.municipalities).toHaveLength(29);
  });
  it('references existing districts', () => {
    const ids = new Set(s.districts.map((d) => d.id));
    for (const m of s.municipalities) expect(ids.has(m.districtId)).toBe(true);
  });
  it('uses each osmName once', () => {
    const all = s.municipalities.flatMap((m) => m.osmNames);
    expect(new Set(all).size).toBe(all.length);
  });
});
