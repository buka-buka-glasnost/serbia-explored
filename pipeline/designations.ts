import type { Designation, Tier } from '../src/shared/types';

// Wikidata QID -> heritage designation (verified 2026-10-26).
export const DESIGNATION_BY_QID: Record<string, Designation> = {
  Q9259: 'unesco_whs',
  Q43113623: 'unesco_whs_part',
  Q1459900: 'unesco_tentative',
  Q19683138: 'ramsar',
  Q3323436: 'heritage_exceptional',
  Q32459: 'heritage_exceptional',
  Q5773555: 'heritage_exceptional',
  Q15455839: 'heritage_exceptional',
  Q3323432: 'heritage_great',
  Q3485475: 'heritage_great',
  Q17097806: 'heritage_great',
  Q5773549: 'heritage_great',
  Q3323469: 'heritage_protected',
  Q3485476: 'heritage_protected',
  Q139254645: 'heritage_protected',
  Q139257193: 'heritage_protected',
};

// Filled in Task 3.
export const NATURE_CLASS_BY_QID: Record<string, Designation> = {};

export const TIER_BY_DESIGNATION: Record<Designation, Tier> = {
  unesco_whs: 1,
  unesco_whs_part: 1,
  unesco_geopark: 1,
  unesco_biosphere: 1,
  heritage_exceptional: 2,
  national_park: 2,
  unesco_tentative: 2,
  heritage_great: 3,
  special_nature_reserve: 3,
  ramsar: 3,
  heritage_protected: 4,
  nature_other: 4,
};

export const NATURE_DESIGNATIONS: ReadonlySet<Designation> = new Set<Designation>([
  'unesco_geopark',
  'unesco_biosphere',
  'national_park',
  'special_nature_reserve',
  'ramsar',
  'nature_other',
]);

// Most important (lowest-numbered) tier among the given designations.
export function tierFor(ds: Designation[]): Tier {
  if (ds.length === 0) {
    throw new Error('tierFor: at least one designation is required');
  }
  return Math.min(...ds.map((d) => TIER_BY_DESIGNATION[d])) as Tier;
}
