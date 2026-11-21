import type { Place } from '../shared/types';

const RADIUS = { 1: 9, 2: 7, 3: 5, 4: 4 } as const;
// flag red, coat-of-arms gold, a lighter flag blue, grey (the same as --tier1..4 in app.css)
export const TIER_FILL = { 1: '#c6363c', 2: '#b07f1c', 3: '#3f78b5', 4: '#8a9099' } as const;
const VISITED_RING = '#25744a';
const TRIP_RING = '#18202e';

export interface MarkerStyle { radius: number; fillColor: string; color: string; weight: number; dashArray?: string }

/** The fill always shows the tier; a ring shows visited (solid green) or on-trip (dark dashed, wins). */
export function markerStyle(p: Place, visited: boolean, inTrip: boolean): MarkerStyle {
  const base = { radius: RADIUS[p.tier], fillColor: TIER_FILL[p.tier] };
  if (inTrip) return { ...base, radius: base.radius + 2, color: TRIP_RING, weight: 2.5, dashArray: '3 2' };
  if (visited) return { ...base, radius: base.radius + 1, color: VISITED_RING, weight: 3 };
  return { ...base, color: '#ffffff', weight: 2 };
}
