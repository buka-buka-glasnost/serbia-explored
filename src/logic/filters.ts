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

export type PlaceFilter = Pick<Settings, 'kosovoShown' | 'tiers' | 'kinds'>;
type AreaShape = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProps>;

export function filterPlaces(places: Place[], s: PlaceFilter, query: string): Place[] {
  return places.filter(
    (p) =>
      s.tiers.includes(p.tier) &&
      s.kinds.includes(p.kind) &&
      (s.kosovoShown || !p.inKosovo) &&
      matchesQuery(p, query),
  );
}

export interface AreaSplit { inside: Place[]; nearby: Place[] }

const bboxes = new WeakMap<AreaShape, [number, number, number, number]>();

/** [west, south, east, north] of the area, cached per feature. */
function bboxOf(area: AreaShape): [number, number, number, number] {
  let box = bboxes.get(area);
  if (!box) {
    box = [Infinity, Infinity, -Infinity, -Infinity];
    const polys = area.geometry.type === 'Polygon' ? [area.geometry.coordinates] : area.geometry.coordinates;
    for (const poly of polys) {
      for (const [lon, lat] of poly[0] ?? []) {
        box[0] = Math.min(box[0], lon); box[1] = Math.min(box[1], lat);
        box[2] = Math.max(box[2], lon); box[3] = Math.max(box[3], lat);
      }
    }
    bboxes.set(area, box);
  }
  return box;
}

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;

export function splitByArea(places: Place[], area: AreaShape, nearbyKm = 10): AreaSplit {
  const inside: Place[] = [];
  const nearby: Place[] = [];
  // Cheap pre-filter: nothing outside the bbox grown by nearbyKm can be inside or nearby.
  const [w, s, e, n] = bboxOf(area);
  const dLat = nearbyKm / KM_PER_DEG_LAT;
  const widestLat = Math.min(89, Math.max(Math.abs(s - dLat), Math.abs(n + dLat)));
  const dLon = nearbyKm / (KM_PER_DEG_LON_EQUATOR * Math.cos((widestLat * Math.PI) / 180));
  for (const p of places) {
    if (p.lat < s - dLat || p.lat > n + dLat || p.lon < w - dLon || p.lon > e + dLon) continue;
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
