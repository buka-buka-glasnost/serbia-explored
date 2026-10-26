import { booleanPointInPolygon, point } from '@turf/turf';
import type { AreaFC, AreaProps, Place } from '../shared/types';
import { splitByArea } from './filters';

export const MUNICIPALITY_ZOOM = 9;

/** The municipality (zoom >= 9) or district (zoom < 9) containing the point, if any. */
export function areaAt(areas: AreaFC, lat: number, lon: number, zoom: number): AreaProps | null {
  const level = zoom >= MUNICIPALITY_ZOOM ? 'municipality' : 'district';
  const pt = point([lon, lat]);
  const hit = areas.features.find((f) => f.properties.level === level && booleanPointInPolygon(pt, f));
  return hit ? hit.properties : null;
}

/** Ids of places inside or near the area, or null when no area is selected. */
export function activeIds(
  places: Place[],
  area: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProps> | undefined,
): Set<string> | null {
  if (!area) return null;
  const { inside, nearby } = splitByArea(places, area);
  return new Set([...inside, ...nearby].map((p) => p.id));
}
