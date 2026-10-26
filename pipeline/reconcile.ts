import { readFileSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { Place } from '../src/shared/types';
import { foldForSearch } from '../src/shared/translit';
import { USER_AGENT } from './http';
import { runSparql } from './sparql';

export interface RegisterEntry {
  registerId: string; name: string; municipality: string;
  category: 'exceptional' | 'great' | 'none';
  type: 'SK' | 'PKIC' | 'AN' | 'ZM';
}

const BASE_URL = 'https://www.heritage.gov.rs/cirilica/Download/';
export const EXCEL_DIR = path.join('data', 'cache', 'excel');
export const REGISTER_FILES: { file: string; type: RegisterEntry['type'] }[] = [
  { file: 'SK.xls', type: 'SK' }, { file: 'PKIC.xls', type: 'PKIC' },
  { file: 'AN.xls', type: 'AN' }, { file: 'ZM.xls', type: 'ZM' },
];
export const CATEGORY_FILES: { file: string; category: 'exceptional' | 'great' }[] = [
  { file: 'Kategorisani_izuz.xls', category: 'exceptional' },
  { file: 'Kategorisani_veliki.xls', category: 'great' },
];

// Column mapping (0-based), found by inspecting the files: two title/header rows, then data.
// SK/PKIC/AN/ZM: [name, "Број уписа" (register id), institute].
// Categorised lists: [#, name, municipality, place/address, note, НКД (register id), gazette].
export const REGISTER_COLS = { name: 0, id: 1 };
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

/** Reads one of SK/PKIC/AN/ZM.xls. These carry no category or municipality column, so category is 'none'. */
export function readRegisterXls(file: string, type: RegisterEntry['type']): RegisterEntry[] {
  return rowsOf(file).slice(FIRST_DATA_ROW)
    .filter((r) => str(r[REGISTER_COLS.id]) && str(r[REGISTER_COLS.name]))
    .map((r) => ({
      registerId: str(r[REGISTER_COLS.id]), name: str(r[REGISTER_COLS.name]), municipality: '', category: 'none', type,
    }));
}

/** Reads Kategorisani_izuz.xls / Kategorisani_veliki.xls. */
export function readCategorisedXls(file: string, category: 'exceptional' | 'great'): RegisterEntry[] {
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

// Municipality ids are `m-` + this slug of the municipality name (see pipeline/areas.ts).
const slug = (s: string) => foldForSearch(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const MIN_CONTAIN = 4;

export type MatchKind = 'id' | 'name' | null;

export function matchKind(
  e: RegisterEntry, places: Place[], registerIdToQid: Map<string, string>,
): MatchKind {
  const qids = new Set(places.map((p) => p.id));
  for (const id of parseRegisterIds(e.registerId)) {
    const qid = registerIdToQid.get(id);
    if (qid && qids.has(qid)) return 'id';
  }
  const name = foldForSearch(e.name).trim();
  if (!e.municipality || !name) return null;
  const muni = `m-${slug(e.municipality)}`;
  const candidates = places.filter((p) => p.municipalityId === muni);
  const names = (p: Place) => [p.nameSr, p.nameEn].filter((n): n is string => !!n).map((n) => foldForSearch(n).trim());
  if (candidates.some((p) => names(p).includes(name))) return 'name';
  const contains = (a: string, b: string) => b.length >= MIN_CONTAIN && a.includes(b);
  return candidates.some((p) => names(p).some((n) => contains(name, n) || contains(n, name))) ? 'name' : null;
}

/** Categorised (exceptional/great) entries that match no place by register id, nor by name within the municipality. */
export function findMissing(
  entries: RegisterEntry[], places: Place[], registerIdToQid: Map<string, string>,
): RegisterEntry[] {
  return entries.filter((e) => e.category !== 'none' && matchKind(e, places, registerIdToQid) === null);
}

/** Wikidata P4245 values mapped to QIDs, keyed by normalised register id. */
export async function fetchRegisterIdMap(): Promise<Map<string, string>> {
  const rows = await runSparql('SELECT ?item ?id WHERE { ?item wdt:P4245 ?id }', 'register-ids-p4245');
  const map = new Map<string, string>();
  for (const r of rows) map.set(normaliseRegisterId(r.id), r.item);
  return map;
}

async function download(file: string): Promise<string> {
  const target = path.join(EXCEL_DIR, file);
  try {
    await stat(target);
    return target;
  } catch { /* not cached */ }
  console.log(`Downloading ${file}`);
  const res = await fetch(BASE_URL + file, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${BASE_URL}${file}`);
  await mkdir(EXCEL_DIR, { recursive: true });
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  await new Promise((r) => setTimeout(r, 1000));
  return target;
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export interface ReconcileResult { total: number; byId: number; byName: number; missing: RegisterEntry[] }

/** Downloads the lists, reconciles against `places`, writes the CSV report. */
export async function reconcile(places: Place[], reportPath: string): Promise<ReconcileResult> {
  for (const { file } of REGISTER_FILES) await download(file); // full register lists, cached for reference
  const entries: RegisterEntry[] = [];
  for (const { file, category } of CATEGORY_FILES) entries.push(...readCategorisedXls(await download(file), category));
  const ids = await fetchRegisterIdMap();
  let byId = 0;
  let byName = 0;
  for (const e of entries) {
    const k = matchKind(e, places, ids);
    if (k === 'id') byId++;
    else if (k === 'name') byName++;
  }
  const missing = findMissing(entries, places, ids);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, [
    'registerId,name,municipality,category,type',
    ...missing.map((e) => [e.registerId, e.name, e.municipality, e.category, e.type].map(csvCell).join(',')),
  ].join('\n') + '\n');
  return { total: entries.length, byId, byName, missing };
}
