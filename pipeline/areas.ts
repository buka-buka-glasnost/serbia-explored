import * as turf from '@turf/turf';
import osmtogeojson from 'osmtogeojson';
import type { AreaFC, AreaProps, LatLon } from '../src/shared/types';
import { foldForSearch, hasCyrillic, toLatin } from '../src/shared/translit';
import kosovoScheme from './data/kosovo-serbian-scheme.json';
import { overpass, type OverpassJson } from './overpass';

type AreaFeature = AreaFC['features'][number];
type Poly = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export interface KosovoScheme {
  districts: { id: string; nameSr: string; nameSq: string }[];
  municipalities: {
    id: string; nameSr: string; nameSq: string; districtId: string; osmNames: string[];
  }[];
}

const SERBIA_REL = 1741311;
const KOSOVO_REL = 2088990;
const SNAP_KM = 2;
const SIMPLIFY_TOLERANCE = 0.001;

/** Area counts the build expects; a mismatch means OSM tagging changed and the area logic needs a look. */
export const EXPECTED_AREA_COUNTS = {
  serbia: { districts: 25, municipalities: 161 },
  kosovo: { districts: 5, municipalities: 29 },
} as const;

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

/** An OSM polygon from osmtogeojson: `id` is "relation/<n>", tags are the properties. */
type OsmFeature = GeoJSON.Feature<Poly, Record<string, string>>;

const isOsmPolygon = (f: GeoJSON.Feature): f is OsmFeature =>
  f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon';

/** Numeric OSM id of a feature ("relation/123" → 123); NaN when absent. */
const osmNumber = (f: OsmFeature) => Number(String(f.id ?? '').split('/').pop());

/** Polygon features sorted by OSM id, so derived ids (and their -2 suffixes) do not depend on response order. */
function toFeatures(json: OverpassJson): OsmFeature[] {
  const fc: GeoJSON.FeatureCollection = osmtogeojson(json);
  return fc.features.filter(isOsmPolygon).sort((a, b) => osmNumber(a) - osmNumber(b));
}

function findRelation(features: OsmFeature[], relId: number): OsmFeature | undefined {
  return features.find((f) => f.id === `relation/${relId}`);
}

async function relationsAtLevel(level: number): Promise<OsmFeature[]> {
  const q =
    `[out:json][timeout:180];rel(${SERBIA_REL});map_to_area->.s;` +
    `rel(area.s)[boundary=administrative][admin_level=${level}];out geom;`;
  return toFeatures(await overpass(q, `serbia-level-${level}`));
}

async function fetchKosovoOsm(): Promise<{ outline: OsmFeature; municipalities: OsmFeature[] }> {
  const outlineQ = `[out:json][timeout:180];rel(${KOSOVO_REL});out geom;`;
  const outline = findRelation(toFeatures(await overpass(outlineQ, 'kosovo-outline')), KOSOVO_REL);
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
  outlines: OutlinesFC;
}> {
  const { outline, municipalities: kosovoOsm } = await fetchKosovoOsm();
  const outsideKosovo = (f: OsmFeature) =>
    !turf.booleanPointInPolygon(turf.pointOnFeature(f), outline);

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
  const districts: AreaFeature[] = districtsOsm.map((f) => {
    // "Златиборски управни округ" → name "Златиборски округ", base "Златиборски" (id d-zlatiborski);
    // "Град Београд" keeps its name, base "Београд".
    const nameSr = cleanDistrict(srName(f.properties));
    const base = nameSr.replace(PREFIX, '').replace(/\s+округ$/i, '');
    return strip(f, {
      id: uniqueId('d', base, used),
      level: 'district',
      nameSr,
      nameSq: f.properties['name:sq'],
      nameEn: f.properties['name:en'],
      inKosovo: false,
    });
  });

  // Belgrade: its 17 city municipalities replace the city-level unit.
  // Sub-city "gradska opština" of other cities (Niš, Vranje, ...) are dropped: the city is the unit.
  const isBelgrade = (f: OsmFeature) => f.properties['ref:RS:grad'] === '79014';
  const cityUnits = cities.filter((c) => !isBelgrade(c));
  const inSomeCity = (f: OsmFeature) => {
    const pt = turf.pointOnFeature(f);
    return cityUnits.some((c) => turf.booleanPointInPolygon(pt, c));
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
  const outlines = await fetchSerbiaOutlines(outline);
  return { areas: { type: 'FeatureCollection', features }, kosovo, outlines };
}

/** Outlines used to shade everything outside Serbia: without Kosovo, and with it. */
export type OutlinesFC = GeoJSON.FeatureCollection<Poly, { id: 'serbia' | 'serbia-with-kosovo' }>;

async function fetchSerbiaOutlines(kosovo: GeoJSON.Feature<Poly>): Promise<OutlinesFC> {
  const q = `[out:json][timeout:180];rel(${SERBIA_REL});out geom;`;
  const serbia = findRelation(toFeatures(await overpass(q, 'serbia-outline')), SERBIA_REL);
  if (!serbia) throw new Error('Serbia outline relation not found');
  // OSM's Serbia relation may or may not include Kosovo; derive both shapes either way.
  const includesKosovo = turf.booleanPointInPolygon(turf.pointOnFeature(kosovo), serbia);
  const without = includesKosovo ? turf.difference(turf.featureCollection([serbia, kosovo])) : serbia;
  const withK = includesKosovo ? serbia : turf.union(turf.featureCollection([serbia, kosovo]));
  if (!without || !withK) throw new Error('Serbia outline geometry failed');
  const shape = (f: GeoJSON.Feature<Poly>, id: 'serbia' | 'serbia-with-kosovo') => {
    const s = turf.simplify(f, { tolerance: SIMPLIFY_TOLERANCE, highQuality: true, mutate: false });
    return turf.truncate({ type: 'Feature' as const, properties: { id }, geometry: s.geometry }, { precision: 5 });
  };
  return {
    type: 'FeatureCollection',
    features: [shape(without as GeoJSON.Feature<Poly>, 'serbia'), shape(withK as GeoJSON.Feature<Poly>, 'serbia-with-kosovo')],
  };
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
  for (const f of kosovoMunicipalities.features) {
    const key = matchKey(f.properties.nameSr);
    const prev = byKey.get(key);
    if (prev) {
      throw new Error(
        `Duplicate OSM municipality key "${key}": "${prev.properties.nameSr}" and "${f.properties.nameSr}"`,
      );
    }
    byKey.set(key, f);
  }
  const used = new Set<string>();

  const munFeatures: AreaFeature[] = scheme.municipalities.map((m) => {
    const parts = m.osmNames.map((name) => {
      const hit = byKey.get(matchKey(name));
      if (!hit) throw new Error(`No OSM municipality matches osmName "${name}" (${m.id})`);
      used.add(matchKey(name));
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

  const unmapped = [...byKey.entries()].filter(([k]) => !used.has(k)).map(([, f]) => f.properties.nameSr);
  if (unmapped.length > 0) {
    throw new Error(`OSM Kosovo municipalities not in any scheme entry: ${unmapped.join(', ')}`);
  }

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

export interface AreaAssignment { districtId: string | null; municipalityId: string | null; inKosovo: boolean | null }

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

/**
 * Returns a function assigning a point to the municipality containing it, or else the nearest one
 * within 2 km. Bounding boxes are computed once. When snapping and `kosovo` is given, municipalities
 * on the same side of the Kosovo outline as the point are preferred.
 */
export function makeAssigner(areas: AreaFC, kosovo?: GeoJSON.Feature): (p: LatLon) => AreaAssignment {
  const muns = areas.features
    .filter((f) => f.properties.level === 'municipality')
    .map((f) => {
      const [w, s, e, n] = turf.bbox(f);
      return { f, w: w - BBOX_PAD_DEG, s: s - BBOX_PAD_DEG, e: e + BBOX_PAD_DEG, n: n + BBOX_PAD_DEG };
    });
  return (p) => {
    const pt = turf.point([p.lon, p.lat]);
    const near = muns
      .filter((m) => p.lon >= m.w && p.lon <= m.e && p.lat >= m.s && p.lat <= m.n)
      .map((m) => m.f);
    let hit = near.find((f) => turf.booleanPointInPolygon(pt, f));
    if (!hit) {
      const close = near
        .map((f) => ({ f, d: distanceKm(pt, f) }))
        .filter((c) => c.d <= SNAP_KM);
      const side = kosovo ? isInKosovo(p, kosovo) : undefined;
      const sameSide = close.filter((c) => c.f.properties.inKosovo === side);
      const pool = sameSide.length > 0 ? sameSide : close;
      let best = Infinity;
      for (const c of pool) if (c.d <= best) { best = c.d; hit = c.f; }
    }
    if (!hit) return { districtId: null, municipalityId: null, inKosovo: null };
    return {
      districtId: hit.properties.districtId ?? null,
      municipalityId: hit.properties.id,
      inKosovo: hit.properties.inKosovo,
    };
  };
}

/** One-off assignment; use makeAssigner for many points. */
export function assignArea(p: LatLon, areas: AreaFC, kosovo?: GeoJSON.Feature): AreaAssignment {
  return makeAssigner(areas, kosovo)(p);
}

export function isInKosovo(p: LatLon, kosovo: GeoJSON.Feature): boolean {
  return turf.booleanPointInPolygon(turf.point([p.lon, p.lat]), kosovo as GeoJSON.Feature<Poly>);
}
