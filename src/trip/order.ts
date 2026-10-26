import type { LatLon } from '../shared/types';

export const MAX_TRIP_STOPS = 9;

const R_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Open-path length: anchor -> path[0] -> path[1] ... (end is free). */
function pathLength(anchor: LatLon, pts: LatLon[], path: number[]): number {
  let total = 0;
  let prev = anchor;
  for (const i of path) {
    total += haversineKm(prev, pts[i]);
    prev = pts[i];
  }
  return total;
}

/** Nearest neighbour then 2-opt from a fixed anchor; returns indexes into `pts`. */
function solveFrom(anchor: LatLon, pts: LatLon[], candidates: number[]): number[] {
  const left = [...candidates];
  const path: number[] = [];
  let cur = anchor;
  while (left.length > 0) {
    let best = 0;
    for (let k = 1; k < left.length; k++) {
      if (haversineKm(cur, pts[left[k]]) < haversineKm(cur, pts[left[best]])) best = k;
    }
    const [next] = left.splice(best, 1);
    path.push(next);
    cur = pts[next];
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < path.length - 1; i++) {
      for (let j = i + 1; j < path.length; j++) {
        const cand = [...path.slice(0, i), ...path.slice(i, j + 1).reverse(), ...path.slice(j + 1)];
        if (pathLength(anchor, pts, cand) < pathLength(anchor, pts, path) - 1e-9) {
          path.splice(0, path.length, ...cand);
          improved = true;
        }
      }
    }
  }
  return path;
}

/** Returns a permutation of stop indexes giving a short open route. */
export function orderStops(stops: LatLon[], start?: LatLon): number[] {
  const all = stops.map((_, i) => i);
  if (stops.length <= 1) return all;
  if (start) return solveFrom(start, stops, all);
  let best: number[] = all;
  let bestLen = Infinity;
  for (const first of all) {
    const rest = solveFrom(stops[first], stops, all.filter((i) => i !== first));
    const path = [first, ...rest];
    const len = pathLength(stops[first], stops, rest);
    if (len < bestLen - 1e-9) {
      bestLen = len;
      best = path;
    }
  }
  return best;
}
