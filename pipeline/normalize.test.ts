// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DESIGNATION_BY_QID, NATURE_CLASS_BY_QID } from './designations';
import { groupRows, mergeRaw, parseWktPoint, type RawPlace } from './normalize';
import type { SparqlRow } from './sparql';
import designatedRows from './__fixtures__/designated-rows.json';
import natureRows from './__fixtures__/nature-rows.json';

const classifyHeritage = (r: SparqlRow) => DESIGNATION_BY_QID[r.code] ?? null;
const classifyNature = (r: SparqlRow) => NATURE_CLASS_BY_QID[r.code] ?? null;

const heritage = groupRows(designatedRows as unknown as SparqlRow[], classifyHeritage);
const nature = groupRows(natureRows as SparqlRow[], classifyNature);
const byId = (places: RawPlace[], id: string) => {
  const p = places.find((x) => x.id === id);
  if (!p) throw new Error(`missing ${id}`);
  return p;
};

describe('parseWktPoint', () => {
  it('parses Point(lon lat) into {lat, lon}', () => {
    expect(parseWktPoint('Point(20.5 43.3)')).toEqual({ lat: 43.3, lon: 20.5 });
  });
  it('returns null for missing or malformed input', () => {
    expect(parseWktPoint(undefined)).toBeNull();
    expect(parseWktPoint('nonsense')).toBeNull();
  });
});

describe('groupRows', () => {
  it('returns one RawPlace per QID', () => {
    const ids = heritage.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(
      [...new Set((designatedRows as unknown as SparqlRow[]).map((r) => r.item))].sort(),
    );
  });

  it('reads Studenica as a World Heritage Site with names, image and wiki titles', () => {
    const p = byId(heritage, 'Q143042');
    expect(p.designations).toEqual(['unesco_whs']);
    expect(p.nameEn).toBe('Studenica monastery');
    expect(p.nameSr).toBe('Манастир Студеница');
    expect(p.coord).not.toBeNull();
    expect(p.wikipediaEn).toBe('Studenica Monastery');
    expect(p.wikipediaSr).toBe('Манастир Студеница');
    expect(p.imageFile).toMatch(/\.\w+$/);
    expect(p.imageFile).not.toMatch(/[%/]/);
  });

  it('collects partOf ids for Đurđevi stupovi (Stari Ras and Sopoćani)', () => {
    const p = byId(heritage, 'Q592512');
    expect(p.designations).toEqual(['unesco_whs_part']);
    expect(p.partOfIds).toContain('Q10913999');
  });

  it('keeps Gracanica (a monastery in Kosovo) with its id, designation and coordinate', () => {
    // groupRows does no country filtering; Kosovo-only filtering happens later, by coordinate.
    const p = byId(heritage, 'Q1137661');
    expect(p.designations).toEqual(['unesco_whs_part']);
    expect(p.coord).toEqual({ lat: 42.598333333, lon: 21.193333333 });
    expect(p.partOfIds).toEqual(['Q1982106']);
  });

  it('takes typeSr and typeEn together from the P31 class with the lowest QID', () => {
    // Q164205 is an ancient city (Q15661340) and an archaeological site (Q839954)
    const p = byId(heritage, 'Q164205');
    expect(p.typeEn).toBe('archaeological site');
    expect(p.typeSr).toBe('археолошко налазиште');
    expect(p.nameSrLatn).toBe('Caričin Grad');
  });

  it('prefers a type with both labels, then sr only, then en only, and never mixes two types', () => {
    const rows = (types: SparqlRow[]): SparqlRow[] => types.map((t) => ({ item: 'Q1', code: 'Q9259', ...t }));
    const pick = (types: SparqlRow[]) => {
      const [p] = groupRows(rows(types), classifyHeritage);
      return [p.typeSr, p.typeEn];
    };
    const both = { type: 'Q7', typeSr: 'седам', typeEn: 'seven' };
    const srOnly = { type: 'Q6', typeSr: 'шест' };
    const enOnly = { type: 'Q5', typeEn: 'five' };
    const none = { type: 'Q3' };
    expect(pick([enOnly, none, srOnly, both])).toEqual(['седам', 'seven']);
    expect(pick([enOnly, none, srOnly])).toEqual(['шест', undefined]);
    expect(pick([enOnly, none])).toEqual([undefined, 'five']);
    expect(pick([both, { type: 'Q4', typeSr: 'четири', typeEn: 'four' }])).toEqual(['четири', 'four']);
  });

  it('records how far apart several coordinates are', () => {
    const [p] = groupRows([
      { item: 'Q1', code: 'Q9259', coord: 'Point(20 44)' },
      { item: 'Q1', code: 'Q9259', coord: 'Point(20 44.1)' },
    ], classifyHeritage);
    expect(p.coordSpreadKm).toBeCloseTo(11.1, 1);
    expect(groupRows([{ item: 'Q2', code: 'Q9259', coord: 'Point(20 44)' }], classifyHeritage)[0].coordSpreadKm).toBeUndefined();
  });

  it('gives the item with two coordinates the smallest by "lat,lon"', () => {
    const rows = (natureRows as SparqlRow[]).filter((r) => r.item === 'Q790075');
    const coords = [...new Set(rows.map((r) => r.coord))];
    expect(coords.length).toBe(2);
    expect(byId(nature, 'Q790075').coord).toEqual({ lat: 44.689962, lon: 20.51765 });
  });

  it('gives the same result for shuffled rows', () => {
    const extra: SparqlRow[] = [
      { item: 'Q9', code: 'Q9259', image: 'http://commons.wikimedia.org/wiki/Special:FilePath/B.jpg', coord: 'Point(21 44)' },
      { item: 'Q9', code: 'Q3323436', image: 'http://commons.wikimedia.org/wiki/Special:FilePath/A.jpg', coord: 'Point(20 45)' },
      { item: 'Q9', code: 'Q9259', partOf: 'Q20', enwiki: 'https://en.wikipedia.org/wiki/Z_title' },
      { item: 'Q9', code: 'Q9259', partOf: 'Q10', enwiki: 'https://en.wikipedia.org/wiki/A_title' },
    ];
    const rows = [...(designatedRows as unknown as SparqlRow[]), ...extra];
    const sortById = (ps: RawPlace[]) => [...ps].sort((a, b) => a.id.localeCompare(b.id));
    const expected = sortById(groupRows(rows, classifyHeritage));
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 10; i++) {
      const shuffled = [...rows].sort(() => rand() - 0.5);
      expect(sortById(groupRows(shuffled, classifyHeritage))).toEqual(expected);
    }
    expect(byId(expected, 'Q9')).toMatchObject({
      imageFile: 'A.jpg', coord: { lat: 44, lon: 21 }, wikipediaEn: 'A title',
      partOfIds: ['Q10', 'Q20'], designations: ['unesco_whs', 'heritage_exceptional'],
    });
  });

  it('keeps a Latin-only sr label as nameSr', () => {
    const p = byId(nature, 'Q31182351');
    expect(p.nameSr).toBe('Danilova kosa');
    expect(p.designations).toEqual(['special_nature_reserve']);
  });

  it('classifies Tara National Park', () => {
    const p = byId(nature, 'Q1266612');
    expect(p.designations).toEqual(['national_park']);
    expect(p.nameEn).toBe('Tara National Park');
  });

  it('unions designations of one item across rows, without duplicates', () => {
    const rows: SparqlRow[] = [
      { item: 'Q1', code: 'Q9259' },
      { item: 'Q1', code: 'Q9259' },
      { item: 'Q1', code: 'Q3323436' },
    ];
    expect(groupRows(rows, classifyHeritage)[0].designations).toEqual([
      'unesco_whs',
      'heritage_exceptional',
    ]);
  });

  it('drops an item whose only code is not classified', () => {
    const rows: SparqlRow[] = [
      { item: 'Q1', code: 'Q6906963', coord: 'Point(20 44)' },
      { item: 'Q2', code: 'Q9259', coord: 'Point(21 45)' },
    ];
    expect(groupRows(rows, classifyHeritage).map((p) => p.id)).toEqual(['Q2']);
  });

  it('keeps an item with an unclassified row first and a classified row later', () => {
    const rows: SparqlRow[] = [
      { item: 'Q1', code: 'Q6906963', labelEn: 'Thing' },
      { item: 'Q1', code: 'Q9259' },
    ];
    const [p] = groupRows(rows, classifyHeritage);
    expect(p.designations).toEqual(['unesco_whs']);
    expect(p.nameEn).toBe('Thing');
  });
});

describe('mergeRaw', () => {
  it('unions by id and unions designations', () => {
    const a = groupRows([{ item: 'Q1', code: 'Q9259', labelEn: 'A' }], classifyHeritage);
    const b = groupRows(
      [
        { item: 'Q1', code: 'Q46169', coord: 'Point(20 44)' },
        { item: 'Q2', code: 'Q46169' },
      ],
      classifyNature,
    );
    const merged = mergeRaw(a, b);
    expect(merged.map((p) => p.id).sort()).toEqual(['Q1', 'Q2']);
    const q1 = byId(merged, 'Q1');
    expect(q1.designations).toEqual(['unesco_whs', 'national_park']);
    expect(q1.nameEn).toBe('A');
    expect(q1.coord).toEqual({ lat: 44, lon: 20 });
  });

  it('does not mutate its inputs', () => {
    const a = groupRows([{ item: 'Q1', code: 'Q9259' }], classifyHeritage);
    const b = groupRows([{ item: 'Q1', code: 'Q46169' }], classifyNature);
    mergeRaw(a, b);
    expect(a[0].designations).toEqual(['unesco_whs']);
  });
});
