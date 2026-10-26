import { describe, expect, it } from 'vitest';
import type { AreaFC, Photo } from '../src/shared/types';
import { assemblePlaces } from './assemble';
import type { Overrides } from './overrides';
import type { RawPlace } from './normalize';

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
const noOverrides: Overrides = { places: {}, added: [], removed: [] };

const raw = (id: string, extra: Partial<RawPlace> = {}): RawPlace => ({
  id, nameSr: `Име ${id}`, designations: ['heritage_exceptional'], partOfIds: [],
  coord: { lat: 44, lon: 21 }, ...extra,
});

function run(items: RawPlace[], extra: { overrides?: Overrides } = {}) {
  return assemblePlaces({
    raw: items, areas, kosovo,
    extractsSr: new Map(), extractsEn: new Map(),
    photos: new Map(), kosovoNatureAllowlist: ['Q1412844'],
    overrides: extra.overrides ?? noOverrides,
  });
}

describe('assemblePlaces', () => {
  it('drops items without a coordinate', () => {
    const { places, dropped } = run([raw('Q1', { coord: null })]);
    expect(places).toEqual([]);
    expect(dropped).toEqual([{ id: 'Q1', name: 'Име Q1', reason: 'no_coordinates' }]);
  });

  it('makes parts of a WHS tier 1 with partOf and drops the composite', () => {
    const whs = raw('Q10', { nameSr: 'Композит', nameEn: 'Composite', designations: ['unesco_whs'] });
    const part = raw('Q11', { partOfIds: ['Q10'] });
    const { places, dropped } = run([whs, part]);
    expect(places.map((p) => p.id)).toEqual(['Q11']);
    expect(places[0].tier).toBe(1);
    expect(places[0].designations).toEqual(['heritage_exceptional', 'unesco_whs_part']);
    expect(places[0].partOf).toEqual({ id: 'Q10', nameSr: 'Композит', nameEn: 'Composite' });
    expect(dropped).toEqual([{ id: 'Q10', name: 'Композит', reason: 'whs_composite' }]);
  });

  it('keeps a stand-alone WHS', () => {
    const { places } = run([raw('Q20', { designations: ['unesco_whs'] })]);
    expect(places).toHaveLength(1);
    expect(places[0].tier).toBe(1);
  });

  it('drops Kosovo national parks unless allowlisted', () => {
    const inK = { coord: { lat: 42.5, lon: 20.8 }, designations: ['national_park' as const] };
    const { places, dropped } = run([
      raw('Q26928875', { ...inK, nameEn: 'Bjeshket e Nemuna' }),
      raw('Q1412844', { ...inK, nameEn: 'Sar Mountains' }),
    ]);
    expect(places.map((p) => p.id)).toEqual(['Q1412844']);
    expect(places[0]).toMatchObject({ inKosovo: true, kind: 'nature', tier: 2 });
    expect(dropped.map((d) => [d.id, d.reason])).toEqual([['Q26928875', 'kosovo_nature_not_serbian']]);
  });

  it('takes inKosovo from the assigned municipality when the point is just outside the outline', () => {
    // 0.01 deg south of the Kosovo outline, snapped to m-k
    const { places } = run([raw('Q50', { coord: { lat: 42.19, lon: 20.8 } })]);
    expect(places[0]).toMatchObject({ municipalityId: 'm-k', inKosovo: true });
  });

  it('uses a partOfNames override when the composite has no labels', () => {
    const whs = raw('Q10', { nameSr: undefined, designations: ['unesco_whs'] });
    const part = raw('Q11', { partOfIds: ['Q10'] });
    const overrides: Overrides = {
      ...noOverrides, partOfNames: { Q10: { nameSr: 'Композит', nameEn: 'Composite' } },
    };
    const { places } = run([whs, part], { overrides });
    expect(places[0].partOf).toEqual({ id: 'Q10', nameSr: 'Композит', nameEn: 'Composite' });
  });

  it('keeps a Kosovo monastery with inKosovo and nameSq', () => {
    const { places } = run([
      raw('Q30', { coord: { lat: 42.65, lon: 20.4 }, nameSq: 'Manastiri' }),
    ]);
    expect(places[0]).toMatchObject({ inKosovo: true, nameSq: 'Manastiri', municipalityId: 'm-k', districtId: 'd-k' });
  });

  it('omits nameSq outside Kosovo', () => {
    const { places } = run([raw('Q31', { nameSq: 'X' })]);
    expect(places[0].nameSq).toBeUndefined();
    expect(places[0]).toMatchObject({ inKosovo: false, municipalityId: 'm-a', access: null });
  });

  it('drops points outside Serbia and Kosovo', () => {
    const { dropped } = run([raw('Q32', { coord: { lat: 48, lon: 10 } })]);
    expect(dropped[0].reason).toBe('outside_serbia');
  });

  it('prefers a Cyrillic sr label, then sr-el, then a Latin sr label, then en, then the QID', () => {
    const name = (r: Partial<RawPlace>) =>
      run([raw('Q40', { nameSr: undefined, ...r })]).places[0].nameSr;
    expect(name({ nameSr: 'Манастир', nameSrLatn: 'Manastir' })).toBe('Манастир');
    expect(name({ nameSr: 'Manastir' })).toBe('Manastir');
    expect(name({ nameSr: 'Manastir', nameSrLatn: 'Manastir L' })).toBe('Manastir L');
    expect(name({ nameEn: 'Monastery' })).toBe('Monastery');
    expect(name({})).toBe('Q40');
  });

  it('attaches photo and trimmed descriptions', () => {
    const photo: Photo = { url: 'u', file: 'F.jpg', author: 'a', license: 'CC', sourceUrl: 's' };
    const { places } = assemblePlaces({
      raw: [raw('Q50', { imageFile: 'F.jpg', wikipediaSr: 'Т', wikipediaEn: 'T' })], areas, kosovo,
      extractsSr: new Map([['Т', 'Опис.']]), extractsEn: new Map([['T', 'Desc.']]),
      photos: new Map([['F.jpg', photo]]), kosovoNatureAllowlist: [], overrides: noOverrides,
    });
    expect(places[0]).toMatchObject({ photo, descSr: 'Опис.', descEn: 'Desc.', wikipediaEn: 'T' });
  });

  it('applies overrides last and reports removals', () => {
    const { places, dropped } = run([raw('Q60'), raw('Q61')], {
      overrides: { places: { Q60: { access: 'hike_boat' } }, added: [], removed: ['Q61'] },
    });
    expect(places.map((p) => [p.id, p.access])).toEqual([['Q60', 'hike_boat']]);
    expect(dropped).toEqual([{ id: 'Q61', name: 'Име Q61', reason: 'removed_by_override' }]);
  });

  it('sorts by tier then name', () => {
    const { places } = run([
      raw('Q71', { nameSr: 'Б' }),
      raw('Q72', { nameSr: 'Ц', designations: ['unesco_whs'] }),
      raw('Q70', { nameSr: 'А' }),
    ]);
    expect(places.map((p) => p.id)).toEqual(['Q72', 'Q70', 'Q71']);
  });
});
