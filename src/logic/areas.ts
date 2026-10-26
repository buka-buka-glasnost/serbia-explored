import { booleanPointInPolygon, point } from '@turf/turf';
import type { AreaFC, AreaProps, Place } from '../shared/types';
import type { AreaSplit } from './filters';

export const MUNICIPALITY_ZOOM = 9;

/** The municipality (zoom >= 9) or district (zoom < 9) containing the point, if any. */
export function areaAt(
  areas: AreaFC, lat: number, lon: number, zoom: number, kosovoShown = true,
): AreaProps | null {
  const level = zoom >= MUNICIPALITY_ZOOM ? 'municipality' : 'district';
  const pt = point([lon, lat]);
  const hit = areas.features.find((f) => f.properties.level === level && (kosovoShown || !f.properties.inKosovo) && booleanPointInPolygon(pt, f));
  return hit ? hit.properties : null;
}

export const OPACITY_INSIDE = 1;
export const OPACITY_NEARBY = 0.55;
export const OPACITY_OTHER = 0.2;

/** Marker opacity per place id (inside 1, nearby 0.55, others 0.2), or null when no area is selected. */
export function areaOpacity(places: Place[], split: AreaSplit | null): Map<string, number> | null {
  if (!split) return null;
  const { inside, nearby } = split;
  const out = new Map<string, number>(places.map((p) => [p.id, OPACITY_OTHER]));
  for (const p of nearby) out.set(p.id, OPACITY_NEARBY);
  for (const p of inside) out.set(p.id, OPACITY_INSIDE);
  return out;
}
