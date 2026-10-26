import type { LatLon } from '../shared/types';

const fmt = (p: LatLon) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

/** Driving directions URL; without an origin Google uses the user's current location. */
export function buildDirectionsUrl(stops: LatLon[], origin?: LatLon): string {
  const dest = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1).map(fmt).join('%7C');
  let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${fmt(dest)}`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  if (origin) url += `&origin=${fmt(origin)}`;
  return url;
}

/** The stops to drive to: the start place is the origin, so it is never also a stop. */
export function routeStops<T extends { id: string }>(stops: T[], startPlaceId: string | null): T[] {
  return startPlaceId ? stops.filter((s) => s.id !== startPlaceId) : stops;
}
