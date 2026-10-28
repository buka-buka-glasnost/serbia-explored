import type { Designation, LatLon } from '../src/shared/types';
import { TIER_BY_DESIGNATION } from './designations';
import type { SparqlRow } from './sparql';
import { cleanText } from './text';

export interface RawPlace {
  id: string;
  nameSr?: string;
  nameSrLatn?: string;
  nameEn?: string;
  nameSq?: string;
  typeSr?: string;
  typeEn?: string;
  designations: Designation[];
  partOfIds: string[];
  coord: LatLon | null;
  /** When the item has several coordinates: the largest distance between them, in km. */
  coordSpreadKm?: number;
  imageFile?: string;
  wikipediaSr?: string;
  wikipediaEn?: string;
}

// "Point(20.5 43.3)" -> { lat: 43.3, lon: 20.5 }
export function parseWktPoint(wkt: string | undefined): LatLon | null {
  const m = wkt && /^Point\(\s*(-?[\d.]+(?:e-?\d+)?)\s+(-?[\d.]+(?:e-?\d+)?)\s*\)$/i.exec(wkt.trim());
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

// Commons file name or Wikipedia title from a Special:FilePath / article URL (underscores become spaces).
function nameFromUrl(url: string): string {
  const seg = url.split('/').pop() ?? url;
  let decoded = seg;
  try {
    decoded = decodeURIComponent(seg);
  } catch {
    /* keep the raw segment */
  }
  return decoded.replace(/_/g, ' ');
}

const LABEL_FIELDS = [
  ['labelSr', 'nameSr'],
  ['labelSrEl', 'nameSrLatn'],
  ['labelEn', 'nameEn'],
  ['labelSq', 'nameSq'],
] as const;

const TEXT_FIELDS = [...LABEL_FIELDS, ['typeSr', 'typeSr'], ['typeEn', 'typeEn']] as const;

/** Smallest value by code-unit order; WDQS row order is not stable, so every pick is by value. */
const smallest = (values: Iterable<string>): string | undefined => {
  let best: string | undefined;
  for (const v of values) if (best === undefined || v < best) best = v;
  return best;
};

const DESIGNATION_ORDER = Object.keys(TIER_BY_DESIGNATION);

const qidNumber = (q: string) => (/^Q(\d+)$/.test(q) ? Number(q.slice(1)) : Infinity);

interface Collected {
  place: RawPlace;
  labels: Map<string, Set<string>>;
  /** P31 type → its labels; rows without ?type (old fixtures) are keyed by their label pair. */
  types: Map<string, { sr?: string; en?: string }>;
  coords: Set<string>;
  images: Set<string>;
  srwiki: Set<string>;
  enwiki: Set<string>;
}

/** Classes with both labels first, then sr only, then en only. */
const labelRank = (t: { sr?: string; en?: string }) => (t.sr && t.en ? 0 : t.sr ? 1 : 2);

/**
 * The type shown for a place: among its P31 classes with an sr or en label, the best labelled
 * (both, then sr only, then en only), ties broken by the lowest numeric QID. Both labels come
 * from that one class, so typeSr and typeEn always describe the same thing.
 */
function pickType(types: Collected['types']): { sr?: string; en?: string } {
  const labelled = [...types.entries()].filter(([, t]) => t.sr || t.en);
  labelled.sort(([a, ta], [b, tb]) =>
    labelRank(ta) - labelRank(tb) || qidNumber(a) - qidNumber(b) || (a < b ? -1 : a > b ? 1 : 0));
  return labelled[0]?.[1] ?? {};
}

/** Largest distance in km between any two of the coordinates (haversine). */
export function coordSpreadKm(coords: LatLon[]): number {
  const rad = Math.PI / 180;
  let best = 0;
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      const a = coords[i], b = coords[j];
      const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
        Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
      best = Math.max(best, 2 * 6371 * Math.asin(Math.sqrt(h)));
    }
  }
  return best;
}

export function groupRows(
  rows: SparqlRow[],
  classify: (row: SparqlRow) => Designation | null,
): RawPlace[] {
  const byId = new Map<string, Collected>();
  for (const row of rows) {
    const id = row.item;
    if (!id) continue;
    let c = byId.get(id);
    if (!c) {
      c = {
        place: { id, designations: [], partOfIds: [], coord: null },
        labels: new Map(), types: new Map(), coords: new Set(), images: new Set(), srwiki: new Set(), enwiki: new Set(),
      };
      byId.set(id, c);
    }
    const designation = classify(row);
    if (designation && !c.place.designations.includes(designation)) c.place.designations.push(designation);
    for (const [col] of LABEL_FIELDS) {
      if (!row[col]) continue;
      if (!c.labels.has(col)) c.labels.set(col, new Set());
      c.labels.get(col)!.add(row[col]);
    }
    if (row.typeSr || row.typeEn) {
      const key = row.type ?? `~${row.typeSr ?? ''}|${row.typeEn ?? ''}`;
      const t = c.types.get(key) ?? {};
      if (row.typeSr && (t.sr === undefined || row.typeSr < t.sr)) t.sr = row.typeSr;
      if (row.typeEn && (t.en === undefined || row.typeEn < t.en)) t.en = row.typeEn;
      c.types.set(key, t);
    }
    if (row.partOf && row.partOf !== id && !c.place.partOfIds.includes(row.partOf)) {
      c.place.partOfIds.push(row.partOf);
    }
    const coord = parseWktPoint(row.coord);
    if (coord) c.coords.add(`${coord.lat},${coord.lon}`);
    if (row.image) c.images.add(nameFromUrl(row.image));
    if (row.srwiki) c.srwiki.add(nameFromUrl(row.srwiki));
    if (row.enwiki) c.enwiki.add(nameFromUrl(row.enwiki));
  }

  const out: RawPlace[] = [];
  for (const c of byId.values()) {
    // Items with no classified designation are dropped.
    if (c.place.designations.length === 0) continue;
    const p = c.place;
    for (const [col, key] of LABEL_FIELDS) {
      const v = smallest(c.labels.get(col) ?? []);
      if (v !== undefined) p[key] = cleanText(v);
    }
    const type = pickType(c.types);
    if (type.sr !== undefined) p.typeSr = cleanText(type.sr);
    if (type.en !== undefined) p.typeEn = cleanText(type.en);
    const coord = smallest(c.coords);
    if (coord) {
      const [lat, lon] = coord.split(',').map(Number);
      p.coord = { lat, lon };
    }
    if (c.coords.size > 1) {
      const all = [...c.coords].map((k) => { const [lat, lon] = k.split(',').map(Number); return { lat, lon }; });
      p.coordSpreadKm = coordSpreadKm(all);
    }
    const image = smallest(c.images);
    if (image !== undefined) p.imageFile = image;
    const sr = smallest(c.srwiki);
    if (sr !== undefined) p.wikipediaSr = sr;
    const en = smallest(c.enwiki);
    if (en !== undefined) p.wikipediaEn = en;
    p.partOfIds.sort();
    p.designations.sort((a, b) => DESIGNATION_ORDER.indexOf(a) - DESIGNATION_ORDER.indexOf(b));
    out.push(p);
  }
  return out;
}

export function mergeRaw(a: RawPlace[], b: RawPlace[]): RawPlace[] {
  const byId = new Map<string, RawPlace>();
  for (const p of [...a, ...b]) {
    const cur = byId.get(p.id);
    if (!cur) {
      byId.set(p.id, { ...p, designations: [...p.designations], partOfIds: [...p.partOfIds] });
      continue;
    }
    for (const d of p.designations) if (!cur.designations.includes(d)) cur.designations.push(d);
    for (const q of p.partOfIds) if (!cur.partOfIds.includes(q)) cur.partOfIds.push(q);
    for (const [, key] of TEXT_FIELDS) {
      if (cur[key] === undefined && p[key] !== undefined) cur[key] = p[key];
    }
    if (!cur.coord) cur.coord = p.coord;
    if (p.coordSpreadKm !== undefined) cur.coordSpreadKm = Math.max(cur.coordSpreadKm ?? 0, p.coordSpreadKm);
    cur.imageFile ??= p.imageFile;
    cur.wikipediaSr ??= p.wikipediaSr;
    cur.wikipediaEn ??= p.wikipediaEn;
  }
  return [...byId.values()];
}
