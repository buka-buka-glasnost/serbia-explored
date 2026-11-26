import type { Place } from '../shared/types';

const RADIUS = { 1: 9, 2: 7, 3: 5, 4: 4 } as const;
// oxblood, coat-of-arms gold, indigo, stone grey (the same as --tier1..4 in app.css)
export const TIER_FILL = { 1: '#9b2f2a', 2: '#9c6e16', 3: '#3f5f8f', 4: '#7d7262' } as const;
const VISITED_RING = '#3d6a38';
const TRIP_RING = '#2a2118';
/** The edge around an unvisited marker: parchment, so it reads on the old map. */
const EDGE = '#f6efdf';

export interface MarkerStyle { radius: number; fillColor: string; color: string; weight: number; dashArray?: string }

/** The fill always shows the tier; a ring shows visited (solid green) or on-trip (dark dashed, wins). */
export function markerStyle(p: Place, visited: boolean, inTrip: boolean): MarkerStyle {
  const base = { radius: RADIUS[p.tier], fillColor: TIER_FILL[p.tier] };
  if (inTrip) return { ...base, radius: base.radius + 2, color: TRIP_RING, weight: 2.5, dashArray: '3 2' };
  if (visited) return { ...base, radius: base.radius + 1, color: VISITED_RING, weight: 3 };
  return { ...base, color: EDGE, weight: 2 };
}
