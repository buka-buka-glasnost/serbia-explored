// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AreaFC, Place } from '../src/shared/types';
import { makeAssigner } from './areas';
import { applyOverrides, parseOverrides, type OverrideContext } from './overrides';

const square = (w: number, s: number, e: number, n: number): GeoJSON.Polygon => ({
  type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
});
const areas: AreaFC = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: square(20, 43, 22, 45),
      properties: { id: 'm-a', level: 'municipality', nameSr: 'A', districtId: 'd-a', inKosovo: false } },
    { type: 'Feature', geometry: square(20, 42.2, 21.5, 42.8),
      properties: { id: 'm-k', level: 'municipality', nameSr: 'K', districtId: 'd-k', inKosovo: true } },
  ],
};
const kosovo: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: square(20, 42.2, 21.5, 42.8) };
const ctx: OverrideContext = { assign: makeAssigner(areas, kosovo), kosovo };

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

  it('names the drop reason when a patched id was dropped earlier', () => {
    const c = { ...ctx, dropped: new Map([['Q5', 'no_coordinates']]) };
    expect(() => applyOverrides([place('Q1')], { places: { Q5: { nameEn: 'x' } }, added: [], removed: [] }, c))
      .toThrow(/Q5.*dropped earlier \(no_coordinates\)/);
  });
});

describe('applyOverrides re-derives fields', () => {
  const base = place('Q1', { lat: 44, lon: 21, municipalityId: 'm-a', districtId: 'd-a' });

  it('recomputes tier and kind when designations change', () => {
    const [p] = applyOverrides([base], { places: { Q1: { designations: ['unesco_biosphere', 'nature_other'] } }, added: [], removed: [] }, ctx);
    expect(p).toMatchObject({ tier: 1, kind: 'nature' });
    const [q] = applyOverrides([base], { places: { Q1: { designations: ['heritage_great', 'ramsar'] } }, added: [], removed: [] }, ctx);
    expect(q).toMatchObject({ tier: 3, kind: 'culture' });
  });

  it('keeps an explicitly patched tier or kind', () => {
    const [p] = applyOverrides([base], { places: { Q1: { designations: ['nature_other'], kind: 'culture' } }, added: [], removed: [] }, ctx);
    expect(p).toMatchObject({ tier: 4, kind: 'culture' });
  });

  it('recomputes the area and inKosovo when lat/lon change', () => {
    const [p] = applyOverrides([base], { places: { Q1: { lat: 42.5, lon: 20.8 } }, added: [], removed: [] }, ctx);
    expect(p).toMatchObject({ districtId: 'd-k', municipalityId: 'm-k', inKosovo: true });
    const [far] = applyOverrides([base], { places: { Q1: { lat: 48, lon: 10 } }, added: [], removed: [] }, ctx);
    expect(far).toMatchObject({ districtId: null, municipalityId: null, inKosovo: false });
  });

  it('derives nameSq from inKosovo after a move, unless the patch sets it', () => {
    const c: OverrideContext = { ...ctx, nameSqFor: (id) => (id === 'Q1' ? 'Emri' : undefined) };
    const [into] = applyOverrides([base], { places: { Q1: { lat: 42.5, lon: 20.8 } }, added: [], removed: [] }, c);
    expect(into.nameSq).toBe('Emri');
    const inK = place('Q1', { lat: 42.5, lon: 20.8, inKosovo: true, municipalityId: 'm-k', nameSq: 'Emri' });
    const [out] = applyOverrides([inK], { places: { Q1: { lat: 44, lon: 21 } }, added: [], removed: [] }, c);
    expect(out.inKosovo).toBe(false);
    expect(out.nameSq).toBeUndefined();
    const [kept] = applyOverrides([inK], { places: { Q1: { lat: 44, lon: 21, nameSq: 'X' } }, added: [], removed: [] }, c);
    expect(kept.nameSq).toBe('X');
  });

  it('keeps an explicitly patched municipality', () => {
    const [p] = applyOverrides([base], { places: { Q1: { lat: 42.5, lon: 20.8, municipalityId: 'm-a' } }, added: [], removed: [] }, ctx);
    expect(p).toMatchObject({ districtId: 'd-k', municipalityId: 'm-a', inKosovo: true });
  });

  it('completes a minimal added place', () => {
    const out = applyOverrides([], {
      places: {}, removed: [],
      added: [{ id: 'x-spot', nameSr: 'Место', lat: 42.5, lon: 20.8, designations: ['nature_other'] }],
    }, ctx);
    expect(out).toEqual([{
      id: 'x-spot', nameSr: 'Место', lat: 42.5, lon: 20.8, designations: ['nature_other'],
      tier: 4, kind: 'nature', districtId: 'd-k', municipalityId: 'm-k', inKosovo: true, access: null,
    }]);
  });

  it('keeps given fields of an added place', () => {
    const [p] = applyOverrides([], {
      places: {}, removed: [],
      added: [{ id: 'x-a', nameSr: 'А', lat: 44, lon: 21, designations: ['heritage_great'], access: 'rough', municipalityId: null }],
    }, ctx);
    expect(p).toMatchObject({ tier: 3, kind: 'culture', access: 'rough', municipalityId: null, districtId: 'd-a', inKosovo: false });
  });
});

describe('parseOverrides', () => {
  const ok = { places: { Q1: { nameEn: 'X' } }, added: [], removed: ['Q2'], _removedNotes: { Q2: 'dup' } };
  it('accepts a valid file', () => {
    expect(parseOverrides(ok)).toEqual(ok);
  });
  it('rejects unknown top-level keys and missing arrays', () => {
    expect(() => parseOverrides({ ...ok, extra: 1 })).toThrow(/top-level key\(s\) extra/);
    expect(() => parseOverrides({ places: {}, removed: [] })).toThrow(/"added" must be an array/);
    expect(() => parseOverrides({ places: {}, added: [] })).toThrow(/"removed"/);
  });
  it('rejects unknown patch fields and bad designations', () => {
    expect(() => parseOverrides({ ...ok, places: { Q1: { nmaeEn: 'X' } } })).toThrow(/Q1: unknown field\(s\) nmaeEn/);
    expect(() => parseOverrides({ ...ok, places: { Q1: { id: 'Q3' } } })).toThrow(/unknown field\(s\) id/);
    expect(() => parseOverrides({ ...ok, places: { Q1: { designations: ['unesco'] } } })).toThrow(/designations/);
  });
  it('checks note maps: string values, keyed by removed / patched ids', () => {
    expect(parseOverrides({ ...ok, _overrideNotes: { Q1: 'why' } })).toMatchObject({ _overrideNotes: { Q1: 'why' } });
    expect(() => parseOverrides({ ...ok, _overrideNotes: { Q7: 'why' } })).toThrow(/_overrideNotes.*not patched: Q7/);
    expect(() => parseOverrides({ ...ok, _removedNotes: { Q1: 'why' } })).toThrow(/_removedNotes.*not removed: Q1/);
    expect(() => parseOverrides({ ...ok, _removedNotes: { Q2: 3 } })).toThrow(/must map ids to strings/);
  });
  it('type-checks patch values', () => {
    const bad = (patch: Record<string, unknown>) => () => parseOverrides({ ...ok, places: { Q1: patch } });
    expect(bad({ tier: 5 })).toThrow(/tier must be 1, 2, 3 or 4/);
    expect(bad({ tier: '1' })).toThrow(/tier/);
    expect(bad({ lat: 95 })).toThrow(/lat must be a number between -90 and 90/);
    expect(bad({ lon: '21' })).toThrow(/lon/);
    expect(bad({ inKosovo: 'yes' })).toThrow(/inKosovo must be true or false/);
    expect(bad({ access: 'car' })).toThrow(/access/);
    expect(bad({ kind: 'other' })).toThrow(/kind/);
    expect(bad({ municipalityId: 3 })).toThrow(/municipalityId/);
    expect(bad({ nameEn: 1 })).toThrow(/nameEn must be a string/);
    expect(() => parseOverrides({ ...ok, places: { Q1: { tier: 2, lat: 44, lon: 21, access: null, municipalityId: null, inKosovo: false } } })).not.toThrow();
  });
  it('rejects duplicate ids in added', () => {
    const a = { id: 'x-a', nameSr: 'А', lat: 44, lon: 21, designations: ['nature_other'] };
    expect(() => parseOverrides({ ...ok, added: [a, { ...a }] })).toThrow(/x-a more than once/);
  });
  it('rejects an id that is both patched and removed', () => {
    expect(() => parseOverrides({ ...ok, removed: ['Q1'] })).toThrow(/both patched and removed: Q1/);
  });
  it('requires the minimal fields of an added place', () => {
    expect(() => parseOverrides({ ...ok, added: [{ id: 'x-a', nameSr: 'А', lat: 44, designations: ['nature_other'] }] }))
      .toThrow(/x-a.*lat and lon/);
  });
  it('accepts the real data/overrides.json', async () => {
    const { readFileSync } = await import('node:fs');
    const json: unknown = JSON.parse(readFileSync(new URL('../data/overrides.json', import.meta.url), 'utf8'));
    expect(() => parseOverrides(json)).not.toThrow();
  });
});
