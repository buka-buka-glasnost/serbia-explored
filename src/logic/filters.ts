import { booleanPointInPolygon, point, pointToPolygonDistance } from '@turf/turf';
import type { AreaProps, Lang, Place, PlaceKind, Tier } from '../shared/types';
import { placeName } from '../i18n/i18n';
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

const LOCALE = { 'sr-Cyrl': 'sr-Cyrl', 'sr-Latn': 'sr-Latn', en: 'en' } as const;

/** Tier first, then the name as displayed in the active language, collated in that locale. */
export function sortForDisplay(places: Place[], lang: Lang): Place[] {
  const coll = new Intl.Collator(LOCALE[lang]);
  const names = new Map(places.map((p) => [p.id, placeName(p, lang)]));
  return [...places].sort((a, b) => a.tier - b.tier || coll.compare(names.get(a.id)!, names.get(b.id)!));
}
