import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as turf from '@turf/turf';
import type { Access, Designation, LatLon } from '../src/shared/types';
import { overpass } from './areas';

export interface Road { paved: boolean; coords: [number, number][] } // [lon, lat]

const DRIVABLE =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|' +
  'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
const PAVED = new Set(['paved', 'asphalt', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones', 'sett', 'cobblestone', 'chipseal', 'metal']);
const SEARCH_M = 300;
const DOOR_M = 150;
const BATCH = 40;

/** Large protected areas have no single entrance, so a point estimate would mislead. */
const AREA_DESIGNATIONS: ReadonlySet<Designation> = new Set(['national_park', 'unesco_biosphere', 'unesco_geopark', 'ramsar']);

export function shouldEstimate(designations: Designation[]): boolean {
  return !designations.some((d) => AREA_DESIGNATIONS.has(d));
}

/** Untagged roads count as paved, except tracks (unless graded solid). */
export function isPaved(tags: Record<string, string>): boolean {
  const surface = tags.surface;
  if (surface) return PAVED.has(surface);
  if (tags.highway === 'track') return tags.tracktype === 'grade1';
  return true;
}

/**
 * Paved road within 150 m → door; otherwise a closer unpaved road within 300 m → rough;
 * otherwise a paved road within 300 m → door; nothing drivable within 300 m → hike/boat.
 */
export function classifyAccess(p: LatLon, roads: Road[]): Access {
  const pt = turf.point([p.lon, p.lat]);
  let paved = Infinity;
  let unpaved = Infinity;
  for (const r of roads) {
    if (r.coords.length < 2) continue;
    const d = turf.pointToLineDistance(pt, turf.lineString(r.coords), { units: 'meters' });
    if (r.paved) paved = Math.min(paved, d);
    else unpaved = Math.min(unpaved, d);
  }
  if (paved <= DOOR_M) return 'door';
  if (unpaved <= SEARCH_M && unpaved < paved) return 'rough';
  if (paved <= SEARCH_M) return 'door';
  return 'hike_boat';
}

interface OsmWay { type: string; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }

function roadsQuery(points: LatLon[]): string {
  const parts = points.map((p) => `way(around:${SEARCH_M},${p.lat},${p.lon})[highway~"^(${DRIVABLE})$"];`);
  return `[out:json][timeout:180];(${parts.join('')});out tags geom;`;
}

const pointKey = (p: LatLon) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

function accessCacheFile(): string {
  return path.join(process.env.OSM_CACHE_DIR ?? path.join('data', 'cache', 'osm'), 'access-by-point.json');
}

/**
 * Access estimate per place id. Results are cached per coordinate, so adding,
 * removing or renaming places only queries OpenStreetMap for points not seen before.
 */
export async function estimateAccess(points: (LatLon & { id: string })[]): Promise<Map<string, Access>> {
  const file = accessCacheFile();
  let cache: Record<string, Access> = {};
  if (process.env.REFRESH !== '1') {
    try {
      cache = JSON.parse(await readFile(file, 'utf8')) as Record<string, Access>;
    } catch {
      /* no cache yet */
    }
  }
  const todo = points.filter((p) => !(pointKey(p) in cache));
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const query = roadsQuery(batch);
    const key = 'roads-' + createHash('sha1').update(query).digest('hex').slice(0, 10);
    console.log(`  roads ${i + 1}-${i + batch.length} of ${todo.length} new points`);
    const json = await overpass(query, key);
    const roads: Road[] = (json.elements as OsmWay[])
      .filter((e) => e.type === 'way' && e.geometry)
      .map((e) => ({ paved: isPaved(e.tags ?? {}), coords: e.geometry!.map((g) => [g.lon, g.lat] as [number, number]) }));
    for (const p of batch) cache[pointKey(p)] = classifyAccess(p, roads);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(cache));
    await new Promise((r) => setTimeout(r, 2000)); // be gentle with the public Overpass server
  }
  return new Map(points.map((p) => [p.id, cache[pointKey(p)]]));
}
