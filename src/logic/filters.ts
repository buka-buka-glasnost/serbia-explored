import { booleanPointInPolygon, point, pointToPolygonDistance } from '@turf/turf';
import type { AreaProps, Lang, Place, PlaceKind, Tier } from '../shared/types';
import { matchesQuery } from './search';

export interface Settings { lang: Lang; kosovoShown: boolean; tiers: Tier[]; kinds: PlaceKind[] }

export const DEFAULT_SETTINGS: Omit<Settings, 'lang'> = {
  kosovoShown: true,
  tiers: [1, 2, 3],
  kinds: ['culture', 'nature'],
};

export function filterPlaces(places: Place[], s: Settings, query: string): Place[] {
  return places.filter(
    (p) =>
      s.tiers.includes(p.tier) &&
      s.kinds.includes(p.kind) &&
      (s.kosovoShown || !p.inKosovo) &&
      matchesQuery(p, query),
  );
}

export function splitByArea(
  places: Place[],
  area: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProps>,
  nearbyKm = 10,
): { inside: Place[]; nearby: Place[] } {
  const inside: Place[] = [];
  const nearby: Place[] = [];
  for (const p of places) {
    const pt = point([p.lon, p.lat]);
    if (booleanPointInPolygon(pt, area)) inside.push(p);
    else if (Math.abs(pointToPolygonDistance(pt, area, { units: 'kilometers' })) <= nearbyKm) {
      nearby.push(p);
    }
  }
  return { inside, nearby };
}
