import type { Designation, LatLon } from '../src/shared/types';
import type { SparqlRow } from './sparql';

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

function lastSegment(url: string): string {
  const seg = url.split('/').pop() ?? url;
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

// Commons file name from a Special:FilePath URL (underscores kept as spaces).
function imageName(url: string): string {
  return lastSegment(url).replace(/_/g, ' ');
}

// Wikipedia article title from a page URL.
function wikiTitle(url: string): string {
  return lastSegment(url).replace(/_/g, ' ');
}

const TEXT_FIELDS = [
  ['labelSr', 'nameSr'],
  ['labelSrEl', 'nameSrLatn'],
  ['labelEn', 'nameEn'],
  ['labelSq', 'nameSq'],
  ['typeSr', 'typeSr'],
  ['typeEn', 'typeEn'],
] as const;

export function groupRows(
  rows: SparqlRow[],
  classify: (row: SparqlRow) => Designation | null,
): RawPlace[] {
  const byId = new Map<string, RawPlace>();
  for (const row of rows) {
    const id = row.item;
    if (!id) continue;
    const designation = classify(row);
    let place = byId.get(id);
    if (!place) {
      place = { id, designations: [], partOfIds: [], coord: null };
      byId.set(id, place);
    }
    if (designation && !place.designations.includes(designation)) {
      place.designations.push(designation);
    }
    for (const [col, key] of TEXT_FIELDS) {
      if (row[col] && place[key] === undefined) place[key] = row[col];
    }
    if (row.partOf && row.partOf !== id && !place.partOfIds.includes(row.partOf)) {
      place.partOfIds.push(row.partOf);
    }
    if (!place.coord) place.coord = parseWktPoint(row.coord);
    if (row.image && place.imageFile === undefined) place.imageFile = imageName(row.image);
    if (row.srwiki && place.wikipediaSr === undefined) place.wikipediaSr = wikiTitle(row.srwiki);
    if (row.enwiki && place.wikipediaEn === undefined) place.wikipediaEn = wikiTitle(row.enwiki);
  }
  // Items with no classified designation are dropped.
  return [...byId.values()].filter((p) => p.designations.length > 0);
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
    cur.imageFile ??= p.imageFile;
    cur.wikipediaSr ??= p.wikipediaSr;
    cur.wikipediaEn ??= p.wikipediaEn;
  }
  return [...byId.values()];
}
