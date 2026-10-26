import type { Place } from '../shared/types';

export const makePlace = (id: string, over: Partial<Place> = {}): Place => ({
  id, nameSr: 'Место ' + id, kind: 'culture', tier: 1, designations: [],
  lat: 44, lon: 21, districtId: null, municipalityId: null, inKosovo: false, access: null,
  ...over,
});
