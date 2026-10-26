import type { Place } from '../shared/types';

const RADIUS = { 1: 9, 2: 7, 3: 5, 4: 4 } as const;
const FILL = { 1: '#c0392b', 2: '#e67e22', 3: '#2e86c1', 4: '#7f8c8d' } as const;

export function markerStyle(
  p: Place,
  visited: boolean,
  inTrip: boolean,
): { radius: number; fillColor: string; color: string; weight: number } {
  const fillColor = inTrip ? '#f1c40f' : visited ? '#27ae60' : FILL[p.tier];
  return { radius: RADIUS[p.tier], fillColor, color: inTrip ? '#333333' : '#ffffff', weight: 2 };
}
