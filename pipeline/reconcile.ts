import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { AreaFC, Place } from '../src/shared/types';
import { foldForSearch, toLatin } from '../src/shared/translit';
import { USER_AGENT, writeFileAtomic } from './http';
import { runSparql } from './sparql';

export interface RegisterEntry {
  registerId: string; name: string; municipality: string;
  category: 'exceptional' | 'great';
  type: 'SK' | 'PKIC' | 'AN' | 'ZM';
}

const BASE_URL = 'https://www.heritage.gov.rs/cirilica/Download/';
const EXCEL_DIR = path.join('data', 'cache', 'excel');
export const CATEGORY_FILES: { file: string; category: RegisterEntry['category'] }[] = [
  { file: 'Kategorisani_izuz.xls', category: 'exceptional' },
  { file: 'Kategorisani_veliki.xls', category: 'great' },
];

// Column mapping (0-based), found by inspecting the files: two title/header rows, then data.
// Categorised lists: [#, name, municipality, place/address, note, НКД (register id), gazette].
export const CATEGORISED_COLS = { name: 1, municipality: 2, id: 5 };
const FIRST_DATA_ROW = 2;

const PREFIX_TYPE: Record<string, RegisterEntry['type']> = { 'СК': 'SK', 'ПКИЦ': 'PKIC', 'АН': 'AN', 'ЗМ': 'ZM' };
// A prefix then a number, optionally followed by bare numbers in the same list ("СК 1403, 1404").
const ID_TOKEN = /(СК|ПКИЦ|АН|ЗМ)\s*(\d+(?:\s*[,;]\s*\d+)*)/g;

/** "СК 2277" (Excel) and "СК 2277" (Wikidata P4245) both become "SK2277". */
export const normaliseRegisterId = (id: string): string => {
  const m = /^\s*(СК|ПКИЦ|АН|ЗМ|SK|PKIC|AN|ZM)\s*(\d+)\s*$/.exec(id);
  if (!m) return id.replace(/\s+/g, '');
  return `${PREFIX_TYPE[m[1]] ?? m[1]}${m[2]}`;
};

/** All register ids named in a cell, normalised ("SK1403"). Cells without a number yield []. */
export function parseRegisterIds(cell: string): string[] {
  const ids: string[] = [];
  for (const m of cell.matchAll(ID_TOKEN)) {
    for (const n of m[2].split(/[,;]/)) ids.push(`${PREFIX_TYPE[m[1]]}${n.trim()}`);
  }
  return ids;
}

const typeOf = (cell: string, fallback: RegisterEntry['type']): RegisterEntry['type'] => {
  const m = /(СК|ПКИЦ|АН|ЗМ)/.exec(cell);
  return m ? PREFIX_TYPE[m[1]] : fallback;
};

function rowsOf(file: string): unknown[][] {
  const wb = XLSX.read(readFileSync(file));
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
}
const str = (v: unknown) => String(v ?? '').trim();

/** Reads Kategorisani_izuz.xls / Kategorisani_veliki.xls. */
export function readCategorisedXls(file: string, category: RegisterEntry['category']): RegisterEntry[] {
  return rowsOf(file).slice(FIRST_DATA_ROW)
    .filter((r) => str(r[CATEGORISED_COLS.name]))
    .map((r) => ({
      registerId: str(r[CATEGORISED_COLS.id]),
      name: str(r[CATEGORISED_COLS.name]),
      municipality: str(r[CATEGORISED_COLS.municipality]),
      category,
      type: typeOf(str(r[CATEGORISED_COLS.id]), 'SK'),
    }));
}

const MIN_CONTAIN = 4;

/** Municipality name as a match key: Latin, folded, without "Град"/"Општина"/"Градска општина". */
const muniKey = (s: string) =>
  foldForSearch(toLatin(s)).replace(/^(gradska opstina|opstina|grad)\s+/, '').trim();

/** Register ids (normalised, e.g. "SK1403") to every QID carrying them; one id can be on several items. */
export type RegisterIdMap = Map<string, Set<string>>;

export type MatchKind = 'id' | 'name' | null;

/**
 * Matches register entries against places: by register id (Wikidata P4245), else by name among the
 * places in the municipality whose area name matches the entry's municipality.
 */
export function makeMatcher(places: Place[], areas: AreaFC, registerIdToQids: RegisterIdMap): (e: RegisterEntry) => MatchKind {
  const qids = new Set(places.map((p) => p.id));
  const munIdsByKey = new Map<string, string[]>();
  for (const f of areas.features) {
    if (f.properties.level !== 'municipality') continue;
    const k = muniKey(f.properties.nameSr);
    munIdsByKey.set(k, [...(munIdsByKey.get(k) ?? []), f.properties.id]);
  }
  const placesByMun = new Map<string, Place[]>();
  for (const p of places) {
    if (p.municipalityId) placesByMun.set(p.municipalityId, [...(placesByMun.get(p.municipalityId) ?? []), p]);
  }
  const names = (p: Place) => [p.nameSr, p.nameEn].filter((n): n is string => !!n).map((n) => foldForSearch(n).trim());
  const contains = (a: string, b: string) => b.length >= MIN_CONTAIN && a.includes(b);

  return (e) => {
    for (const id of parseRegisterIds(e.registerId)) {
      for (const qid of registerIdToQids.get(id) ?? []) if (qids.has(qid)) return 'id';
    }
    const name = foldForSearch(e.name).trim();
    if (!e.municipality || !name) return null;
    const candidates = (munIdsByKey.get(muniKey(e.municipality)) ?? []).flatMap((m) => placesByMun.get(m) ?? []);
    if (candidates.some((p) => names(p).includes(name))) return 'name';
    return candidates.some((p) => names(p).some((n) => contains(name, n) || contains(n, name))) ? 'name' : null;
  };
}

/** Entries that match no place by register id, nor by name within the municipality. */
export function findMissing(
  entries: RegisterEntry[], places: Place[], areas: AreaFC, registerIdToQids: RegisterIdMap,
): RegisterEntry[] {
  const match = makeMatcher(places, areas, registerIdToQids);
  return entries.filter((e) => match(e) === null);
}

/** Wikidata P4245 values mapped to QIDs, keyed by normalised register id. */
export async function fetchRegisterIdMap(): Promise<RegisterIdMap> {
  const rows = await runSparql('SELECT ?item ?id WHERE { ?item wdt:P4245 ?id }', 'register-ids-p4245');
  const map: RegisterIdMap = new Map();
  for (const r of rows) {
    const k = normaliseRegisterId(r.id);
    if (!map.has(k)) map.set(k, new Set());
    map.get(k)!.add(r.item);
  }
  return map;
}

const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // .xls
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // .xlsx

/** True when the bytes start like an Excel file (legacy .xls or .xlsx). */
export function looksLikeExcel(buf: Uint8Array): boolean {
  const starts = (magic: number[]) => magic.every((b, i) => buf[i] === b);
  return starts(OLE2_MAGIC) || starts(ZIP_MAGIC);
}

async function download(file: string): Promise<string> {
  const target = path.join(EXCEL_DIR, file);
  try {
    await stat(target);
    return target;
  } catch { /* not cached */ }
  console.log(`Downloading ${file}`);
  const url = BASE_URL + file;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // An error or maintenance page can come back as HTML with status 200; never cache that.
  if (!looksLikeExcel(buf)) {
    throw new Error(`${url} is not an Excel file (content-type ${res.headers.get('content-type') ?? 'none'})`);
  }
  await writeFileAtomic(target, buf);
  await new Promise((r) => setTimeout(r, 1000));
  return target;
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export interface ReconcileResult { total: number; byId: number; byName: number; missing: RegisterEntry[] }

/** Downloads the categorised lists and reconciles them against `places`. Writes nothing but the Excel cache. */
export async function reconcile(places: Place[], areas: AreaFC): Promise<ReconcileResult> {
  const entries: RegisterEntry[] = [];
  for (const { file, category } of CATEGORY_FILES) entries.push(...readCategorisedXls(await download(file), category));
  const match = makeMatcher(places, areas, await fetchRegisterIdMap());
  let byId = 0;
  let byName = 0;
  const missing: RegisterEntry[] = [];
  for (const e of entries) {
    const k = match(e);
    if (k === 'id') byId++;
    else if (k === 'name') byName++;
    else missing.push(e);
  }
  return { total: entries.length, byId, byName, missing };
}

/** The missing-from-map.csv report. */
export function missingCsv(missing: RegisterEntry[]): string {
  return [
    'registerId,name,municipality,category,type',
    ...missing.map((e) => [e.registerId, e.name, e.municipality, e.category, e.type].map(csvCell).join(',')),
  ].join('\n') + '\n';
}
