import { copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import * as turf from '@turf/turf';
import type { Access, Designation, LatLon } from '../src/shared/types';
import { readJsonCache, writeFileAtomic } from './http';
import { overpass } from './overpass';

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

/**
 * Bump when DRIVABLE, PAVED, SEARCH_M, DOOR_M or classifyAccess change: the per-point cache
 * file is named after it, so changed rules start from an empty cache.
 */
export const ACCESS_RULES_VERSION = 1;

function cacheDir(): string {
  return process.env.OSM_CACHE_DIR ?? path.join('data', 'cache', 'osm');
}

const exists = (f: string) => stat(f).then(() => true, () => false);

/** The versioned cache file; a pre-versioning `access-by-point.json` (same rules as v1) is adopted once. */
async function accessCacheFile(): Promise<string> {
  const file = path.join(cacheDir(), `access-by-point.v${ACCESS_RULES_VERSION}.json`);
  const legacy = path.join(cacheDir(), 'access-by-point.json');
  if (ACCESS_RULES_VERSION === 1 && !(await exists(file)) && (await exists(legacy))) {
    await copyFile(legacy, file);
    console.log(`  adopted ${legacy} as ${path.basename(file)}`);
  }
  return file;
}

async function fetchRoads(points: LatLon[]): Promise<Road[]> {
  const json = await overpass(roadsQuery(points), null, { allowEmpty: true });
  return (json.elements as OsmWay[])
    .filter((e) => e.type === 'way' && e.geometry)
    .map((e) => ({ paved: isPaved(e.tags ?? {}), coords: e.geometry!.map((g) => [g.lon, g.lat] as [number, number]) }));
}

const pause = () => new Promise((r) => setTimeout(r, 2000)); // be gentle with the public Overpass server

/**
 * Classify a batch. An empty answer is trusted only for a single point ("no road within 300 m");
 * for a whole batch it more likely means a server problem, so each point is then asked alone.
 */
async function classifyBatch(batch: LatLon[]): Promise<Access[]> {
  const roads = await fetchRoads(batch);
  if (roads.length > 0 || batch.length === 1) return batch.map((p) => classifyAccess(p, roads));
  console.warn(`  ! no roads at all for ${batch.length} points; asking for each point alone`);
  const out: Access[] = [];
  for (const p of batch) {
    await pause();
    out.push(classifyAccess(p, await fetchRoads([p])));
  }
  return out;
}

/**
 * Access estimate per place id. Results are cached per coordinate, so adding,
 * removing or renaming places only queries OpenStreetMap for points not seen before.
 * Road responses themselves are not cached: the per-point results are the cache.
 */
export async function estimateAccess(points: (LatLon & { id: string })[]): Promise<Map<string, Access>> {
  const file = await accessCacheFile();
  const cache: Record<string, Access> =
    (process.env.REFRESH !== '1' ? await readJsonCache<Record<string, Access>>(file) : undefined) ?? {};
  const todo = [...new Map(points.filter((p) => !(pointKey(p) in cache)).map((p) => [pointKey(p), p])).values()];
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    console.log(`  roads ${i + 1}-${i + batch.length} of ${todo.length} new points`);
    const access = await classifyBatch(batch);
    batch.forEach((p, j) => { cache[pointKey(p)] = access[j]; });
    await writeFileAtomic(file, JSON.stringify(cache));
    if (i + BATCH < todo.length) await pause();
  }
  return new Map(points.map((p) => [p.id, cache[pointKey(p)]]));
}
