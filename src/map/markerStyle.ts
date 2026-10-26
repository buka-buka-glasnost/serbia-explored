import type { Place } from '../shared/types';

const RADIUS = { 1: 9, 2: 7, 3: 5, 4: 4 } as const;
export const TIER_FILL = { 1: '#c0392b', 2: '#e67e22', 3: '#138d75', 4: '#7f8c8d' } as const;
const VISITED_RING = '#1e8449';
const TRIP_RING = '#1d2125';

export interface MarkerStyle { radius: number; fillColor: string; color: string; weight: number; dashArray?: string }

/** The fill always shows the tier; a ring shows visited (solid green) or on-trip (dark dashed, wins). */
export function markerStyle(p: Place, visited: boolean, inTrip: boolean): MarkerStyle {
  const base = { radius: RADIUS[p.tier], fillColor: TIER_FILL[p.tier] };
  if (inTrip) return { ...base, radius: base.radius + 2, color: TRIP_RING, weight: 2.5, dashArray: '3 2' };
  if (visited) return { ...base, radius: base.radius + 1, color: VISITED_RING, weight: 3 };
  return { ...base, color: '#ffffff', weight: 2 };
}
