import { describe, expect, it } from 'vitest';
import type { Place } from '../shared/types';
import { matchesQuery } from './search';

const p: Place = {
  id: 'Q2', nameSr: 'Ђавоља варош', typeSr: 'природни споменик', kind: 'nature', tier: 3, designations: [],
  lat: 43, lon: 21, districtId: null, municipalityId: null, inKosovo: false, access: null,
};

describe('matchesQuery', () => {
  it.each(['djavolja', 'Đavolja', 'Ђавоља', 'DAVOLJA', '', 'споменик'])('matches %s', (q) => {
    expect(matchesQuery(p, q)).toBe(true);
  });
  it('rejects unrelated queries', () => {
    expect(matchesQuery(p, 'studenica')).toBe(false);
  });
  it('matches English and Albanian names', () => {
    const q = { ...p, nameEn: 'Devil Town', nameSq: 'Qyteti i Djallit' };
    expect(matchesQuery(q, 'devil')).toBe(true);
    expect(matchesQuery(q, 'djallit')).toBe(true);
  });
});
