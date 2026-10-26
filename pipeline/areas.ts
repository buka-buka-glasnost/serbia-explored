import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as turf from '@turf/turf';
import osmtogeojson from 'osmtogeojson';
import type { AreaFC, AreaProps, LatLon } from '../src/shared/types';
import { foldForSearch, hasCyrillic, toLatin } from '../src/shared/translit';
import kosovoScheme from './data/kosovo-serbian-scheme.json';

type AreaFeature = AreaFC['features'][number];
type Poly = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export interface KosovoScheme {
  districts: { id: string; nameSr: string; nameSq: string }[];
  municipalities: {
    id: string; nameSr: string; nameSq: string; districtId: string; osmNames: string[];
  }[];
}

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'SerbiaExplored/0.1 (data pipeline)';
const BACKOFF_MS = [10000, 30000, 60000, 90000];
const SERBIA_REL = 1741311;
const KOSOVO_REL = 2088990;
const SNAP_KM = 2;
const SIMPLIFY_TOLERANCE = 0.001;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function cacheDir(): string {
  return process.env.OSM_CACHE_DIR ?? path.join('data', 'cache', 'osm');
}

interface OverpassJson { elements: unknown[] }

async function overpass(query: string, cacheKey: string): Promise<OverpassJson> {
  const file = path.join(cacheDir(), `${cacheKey}.json`);
  if (process.env.REFRESH !== '1') {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as OverpassJson;
    } catch {
      /* not cached */
    }
  }
  let lastError: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1]);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ data: query }).toString(),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`Overpass HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const text = await res.text();
      // Overpass reports runtime errors inside a 200 body.
      const json = JSON.parse(text) as OverpassJson & { remark?: string };
      if (json.remark && /error|timed out/i.test(json.remark)) {
        lastError = new Error(`Overpass remark: ${json.remark}`);
        continue;
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text);
      return json;
    } catch (e) {
      if (e instanceof Error && /^Overpass HTTP 4/.test(e.message)) throw e;
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Overpass request failed');
}

// ---------- names ----------

const slug = (s: string) =>
  foldForSearch(toLatin(s)).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const PREFIX = /^(градска општина|општина|град)\s+/i;
const DISTRICT_WORDS = /\s+управни\s+округ$/i;

/** Serbian name from OSM tags: name:sr if Cyrillic, else name. */
function srName(tags: Record<string, string>): string {
  const n = tags['name:sr'] && hasCyrillic(tags['name:sr']) ? tags['name:sr'] : tags.name ?? '';
  return n.trim();
}
const cleanMunicipality = (n: string) => n.replace(PREFIX, '').trim();
const cleanDistrict = (n: string) => n.replace(DISTRICT_WORDS, ' округ').trim();
const matchKey = (s: string) => foldForSearch(toLatin(s.replace(/^opština\s+/i, '')));

// ---------- fetching ----------

type OsmFeature = GeoJSON.Feature<Poly, Record<string, string> & { id?: string }>;

function toFeatures(json: OverpassJson): OsmFeature[] {
  const fc = osmtogeojson(json as never) as GeoJSON.FeatureCollection;
  return fc.features.filter(
    (f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon',
  ) as unknown as OsmFeature[];
}

async function relationsAtLevel(level: number): Promise<OsmFeature[]> {
  const q =
    `[out:json][timeout:180];rel(${SERBIA_REL});map_to_area->.s;` +
    `rel(area.s)[boundary=administrative][admin_level=${level}];out geom;`;
  return toFeatures(await overpass(q, `serbia-level-${level}`));
}

async function fetchKosovoOsm(): Promise<{ outline: OsmFeature; municipalities: OsmFeature[] }> {
  const outlineQ = `[out:json][timeout:180];rel(${KOSOVO_REL});out geom;`;
  const outline = toFeatures(await overpass(outlineQ, 'kosovo-outline')).find((f) =>
    String(f.id ?? (f.properties as { id?: string }).id).endsWith(String(KOSOVO_REL)),
  );
  if (!outline) throw new Error('Kosovo outline relation not found');
  const q =
    `[out:json][timeout:180];rel(${KOSOVO_REL});map_to_area->.k;` +
    `rel(area.k)[boundary=administrative][admin_level=6]["name:sq"];out geom;`;
  const municipalities = toFeatures(await overpass(q, 'kosovo-municipalities'));
  return { outline, municipalities };
}

function simplified<T extends GeoJSON.Feature<Poly, AreaProps>>(f: T): T {
  const s = turf.simplify(f, { tolerance: SIMPLIFY_TOLERANCE, highQuality: true, mutate: false });
  return turf.truncate(s, { precision: 5, mutate: true }) as T;
}

function uniqueId(prefix: string, name: string, used: Set<string>): string {
  const base = `${prefix}-${slug(name)}`;
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
  used.add(id);
  return id;
}

function strip(f: OsmFeature, props: AreaProps): AreaFeature {
  return { type: 'Feature', properties: props, geometry: f.geometry };
}

export async function fetchAreas(): Promise<{
  areas: AreaFC;
  kosovo: GeoJSON.Feature<GeoJSON.MultiPolygon | GeoJSON.Polygon>;
}> {
  const { outline, municipalities: kosovoOsm } = await fetchKosovoOsm();
  const outsideKosovo = (f: OsmFeature) =>
    !turf.booleanPointInPolygon(turf.pointOnFeature(f), outline as GeoJSON.Feature<Poly>);

  // Serbian tagging filters out the neighbouring countries' units the area query also returns.
  const districtsOsm = (await relationsAtLevel(6)).filter(
    (f) => f.properties['ref:RS:okrug'] !== undefined && outsideKosovo(f),
  );
  const cities = (await relationsAtLevel(7)).filter(
    (f) => f.properties['ref:RS:grad'] !== undefined && outsideKosovo(f),
  );
  const level8 = (await relationsAtLevel(8)).filter(
    (f) => f.properties['ref:RS:opstina'] !== undefined && outsideKosovo(f),
  );

  const used = new Set<string>();
  const districts: AreaFeature[] = districtsOsm.map((f) =>
    strip(f, {
      id: uniqueId('d', cleanDistrict(srName(f.properties)).replace(PREFIX, '').replace(/\s+округ$/i, ''), used),
      level: 'district',
      nameSr: cleanDistrict(srName(f.properties)),
      nameSq: f.properties['name:sq'],
      nameEn: f.properties['name:en'],
      inKosovo: false,
    }),
  );

  // Belgrade: its 17 city municipalities replace the city-level unit.
  // Sub-city "gradska opština" of other cities (Niš, Vranje, ...) are dropped: the city is the unit.
  const isBelgrade = (f: OsmFeature) => f.properties['ref:RS:grad'] === '79014';
  const cityUnits = cities.filter((c) => !isBelgrade(c));
  const inSomeCity = (f: OsmFeature) => {
    const pt = turf.pointOnFeature(f);
    return cityUnits.some((c) => turf.booleanPointInPolygon(pt, c as GeoJSON.Feature<Poly>));
  };
  const munOsm = [...cityUnits, ...level8.filter((f) => !inSomeCity(f))];

  const usedM = new Set<string>();
  const municipalities: AreaFeature[] = munOsm.map((f) => {
    const pt = turf.pointOnFeature(f);
    const parent = districts.find((d) => turf.booleanPointInPolygon(pt, d));
    if (!parent) throw new Error(`No district for ${srName(f.properties)}`);
    const nameSr = cleanMunicipality(srName(f.properties));
    return strip(f, {
      id: uniqueId('m', nameSr, usedM),
      level: 'municipality',
      nameSr,
      nameSq: f.properties['name:sq'],
      nameEn: f.properties['name:en'],
      districtId: parent.properties.id,
      inKosovo: false,
    });
  });

  // Kosovo-scheme OSM municipalities, keyed by their Serbian name.
  const kosovoRaw: AreaFC = {
    type: 'FeatureCollection',
    features: kosovoOsm.map((f) =>
      strip(f, {
        id: `osm-${f.id}`,
        level: 'municipality',
        nameSr: cleanMunicipality(srName(f.properties)),
        nameSq: f.properties['name:sq'],
        inKosovo: true,
      }),
    ),
  };
  const kosovoAreas = buildKosovoSerbianScheme(kosovoRaw, kosovoScheme as KosovoScheme);

  const features = [...districts, ...municipalities, ...kosovoAreas.features].map(simplified);
  const kosovo = turf.simplify(
    { type: 'Feature', properties: {}, geometry: outline.geometry } as GeoJSON.Feature<Poly>,
    { tolerance: SIMPLIFY_TOLERANCE, highQuality: true },
  );
  return { areas: { type: 'FeatureCollection', features }, kosovo };
}

// ---------- Kosovo scheme ----------

function unionAll(features: AreaFeature[]): Poly {
  if (features.length === 1) return features[0].geometry;
  const u = turf.union(turf.featureCollection(features));
  if (!u) throw new Error('Union failed');
  return u.geometry;
}

export function buildKosovoSerbianScheme(kosovoMunicipalities: AreaFC, scheme: KosovoScheme): AreaFC {
  const byKey = new Map<string, AreaFeature>();
  for (const f of kosovoMunicipalities.features) byKey.set(matchKey(f.properties.nameSr), f);

  const munFeatures: AreaFeature[] = scheme.municipalities.map((m) => {
    const parts = m.osmNames.map((name) => {
      const hit = byKey.get(matchKey(name));
      if (!hit) throw new Error(`No OSM municipality matches osmName "${name}" (${m.id})`);
      return hit;
    });
    return {
      type: 'Feature',
      properties: {
        id: m.id, level: 'municipality', nameSr: m.nameSr, nameSq: m.nameSq,
        districtId: m.districtId, inKosovo: true,
      },
      geometry: unionAll(parts),
    };
  });

  const distFeatures: AreaFeature[] = scheme.districts.map((d) => {
    const members = munFeatures.filter((m) => m.properties.districtId === d.id);
    if (members.length === 0) throw new Error(`District ${d.id} has no municipalities`);
    return {
      type: 'Feature',
      properties: { id: d.id, level: 'district', nameSr: d.nameSr, nameSq: d.nameSq, inKosovo: true },
      geometry: unionAll(members),
    };
  });

  return { type: 'FeatureCollection', features: [...distFeatures, ...munFeatures] };
}

// ---------- assignment ----------

const BBOX_PAD_DEG = 0.03; // > 2 km at any latitude in Serbia

function nearBbox(p: LatLon, f: AreaFeature): boolean {
  const [w, s, e, n] = turf.bbox(f);
  return p.lon >= w - BBOX_PAD_DEG && p.lon <= e + BBOX_PAD_DEG &&
    p.lat >= s - BBOX_PAD_DEG && p.lat <= n + BBOX_PAD_DEG;
}

function distanceKm(pt: GeoJSON.Feature<GeoJSON.Point>, f: AreaFeature): number {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let best = Infinity;
  for (const rings of polys) {
    for (const ring of rings) {
      const d = turf.pointToLineDistance(pt, turf.lineString(ring), { units: 'kilometers' });
      if (d < best) best = d;
    }
  }
  return best;
}

export function assignArea(
  p: LatLon,
  areas: AreaFC,
): { districtId: string | null; municipalityId: string | null } {
  const pt = turf.point([p.lon, p.lat]);
  const muns = areas.features.filter((f) => f.properties.level === 'municipality' && nearBbox(p, f));
  let hit = muns.find((f) => turf.booleanPointInPolygon(pt, f));
  if (!hit) {
    let best = SNAP_KM;
    for (const f of muns) {
      const d = distanceKm(pt, f);
      if (d <= best) { best = d; hit = f; }
    }
  }
  if (!hit) return { districtId: null, municipalityId: null };
  return { districtId: hit.properties.districtId ?? null, municipalityId: hit.properties.id };
}

export function isInKosovo(p: LatLon, kosovo: GeoJSON.Feature): boolean {
  return turf.booleanPointInPolygon(turf.point([p.lon, p.lat]), kosovo as GeoJSON.Feature<Poly>);
}
