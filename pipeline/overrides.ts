import type { Designation, Place } from '../src/shared/types';
import { isInKosovo, type AreaAssignment } from './areas';
import { NATURE_DESIGNATIONS, TIER_BY_DESIGNATION, tierFor } from './designations';

export type PlacePatch = Partial<Omit<Place, 'id'>>;

/** A manual place: the minimum is id, nameSr, lat, lon and designations; the rest is derived unless given. */
export type AddedPlace = Pick<Place, 'id' | 'nameSr' | 'lat' | 'lon' | 'designations'> &
  Partial<Omit<Place, 'id' | 'nameSr' | 'lat' | 'lon' | 'designations'>>;

export interface Overrides {
  places: Record<string, PlacePatch>; // patch by id
  added: AddedPlace[]; // manual places (id "x-<slug>")
  removed: string[]; // ids to drop
  /** Display names for WHS composites (partOf) whose raw labels are missing. */
  partOfNames?: Record<string, { nameSr: string; nameEn?: string }>;
  /** Why each id in `removed` is removed; documentation only. */
  _removedNotes?: Record<string, string>;
  /** Why each id in `places` is patched; documentation only. */
  _overrideNotes?: Record<string, string>;
}

/** Every Place field; `satisfies` makes the compiler flag a field added to Place but not here. */
const PLACE_FIELDS = {
  id: true, nameSr: true, nameEn: true, nameSq: true, typeSr: true, typeEn: true,
  kind: true, tier: true, designations: true, partOf: true, lat: true, lon: true,
  districtId: true, municipalityId: true, inKosovo: true, photo: true, descSr: true, descEn: true,
  access: true, accessEstimated: true, wikipediaSr: true, wikipediaEn: true,
} satisfies Record<keyof Place, true>;
const PATCH_KEYS = new Set(Object.keys(PLACE_FIELDS).filter((k) => k !== 'id'));
const TOP_KEYS = new Set(['places', 'added', 'removed', 'partOfNames', '_removedNotes', '_overrideNotes']);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function checkDesignations(where: string, v: unknown): void {
  if (!Array.isArray(v) || v.length === 0 || !v.every((d) => typeof d === 'string' && d in TIER_BY_DESIGNATION)) {
    throw new Error(`${where}: designations must be a non-empty list of known designations, got ${JSON.stringify(v)}`);
  }
}

const isStr = (v: unknown) => typeof v === 'string';
const isNum = (lo: number, hi: number) => (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const oneOf = (...xs: unknown[]) => (v: unknown) => xs.includes(v);
const strOrNull = (v: unknown) => v === null || typeof v === 'string';
const isPhoto = (v: unknown) =>
  isObject(v) && ['url', 'file', 'author', 'license', 'sourceUrl'].every((k) => typeof v[k] === 'string');
const isPartOf = (v: unknown) =>
  isObject(v) && typeof v.id === 'string' && typeof v.nameSr === 'string' && (v.nameEn === undefined || typeof v.nameEn === 'string');

/** Value checks per Place field (designations are checked separately, with a clearer message). */
const VALUE_CHECKS: Record<Exclude<keyof Place, 'designations'>, [(v: unknown) => boolean, string]> = {
  id: [isStr, 'a string'], nameSr: [isStr, 'a string'], nameEn: [isStr, 'a string'], nameSq: [isStr, 'a string'],
  typeSr: [isStr, 'a string'], typeEn: [isStr, 'a string'],
  kind: [oneOf('culture', 'nature'), '"culture" or "nature"'],
  tier: [oneOf(1, 2, 3, 4), '1, 2, 3 or 4'],
  partOf: [isPartOf, 'an object with id and nameSr'],
  lat: [isNum(-90, 90), 'a number between -90 and 90'], lon: [isNum(-180, 180), 'a number between -180 and 180'],
  districtId: [strOrNull, 'a string or null'], municipalityId: [strOrNull, 'a string or null'],
  inKosovo: [(v) => typeof v === 'boolean', 'true or false'],
  photo: [isPhoto, 'a photo object (url, file, author, license, sourceUrl)'],
  descSr: [isStr, 'a string'], descEn: [isStr, 'a string'],
  access: [oneOf('door', 'rough', 'hike_boat', null), '"door", "rough", "hike_boat" or null'],
  accessEstimated: [(v) => typeof v === 'boolean', 'true or false'],
  wikipediaSr: [isStr, 'a string'], wikipediaEn: [isStr, 'a string'],
};

function checkFields(where: string, obj: Record<string, unknown>, allowed: Set<string>): void {
  const bad = Object.keys(obj).filter((k) => !allowed.has(k));
  if (bad.length > 0) throw new Error(`${where}: unknown field(s) ${bad.join(', ')}`);
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'designations') { checkDesignations(where, v); continue; }
    const [ok, want] = VALUE_CHECKS[k as keyof typeof VALUE_CHECKS];
    if (!ok(v)) throw new Error(`${where}: ${k} must be ${want}, got ${JSON.stringify(v)}`);
  }
}

/** Validate the shape of data/overrides.json and return it typed. Throws naming the first problem. */
export function parseOverrides(json: unknown): Overrides {
  const where = 'data/overrides.json';
  if (!isObject(json)) throw new Error(`${where}: expected an object`);
  const extra = Object.keys(json).filter((k) => !TOP_KEYS.has(k));
  if (extra.length > 0) throw new Error(`${where}: unknown top-level key(s) ${extra.join(', ')}`);
  if (!isObject(json.places)) throw new Error(`${where}: "places" must be an object`);
  if (!Array.isArray(json.added)) throw new Error(`${where}: "added" must be an array`);
  if (!Array.isArray(json.removed) || !json.removed.every((id) => typeof id === 'string')) {
    throw new Error(`${where}: "removed" must be an array of ids`);
  }
  if (json.partOfNames !== undefined && !isObject(json.partOfNames)) throw new Error(`${where}: "partOfNames" must be an object`);

  for (const [id, patch] of Object.entries(json.places)) {
    if (!isObject(patch)) throw new Error(`${where}: patch for ${id} must be an object`);
    checkFields(`${where} places.${id}`, patch, PATCH_KEYS);
  }
  const removed = new Set(json.removed);
  const both = Object.keys(json.places).filter((id) => removed.has(id));
  if (both.length > 0) throw new Error(`${where}: id(s) both patched and removed: ${both.join(', ')}`);
  // Notes document entries elsewhere in the file: string values, keyed by an id that is removed / patched.
  const patched = new Set(Object.keys(json.places));
  for (const [key, ids, what] of [['_removedNotes', removed, 'removed'], ['_overrideNotes', patched, 'patched']] as const) {
    const notes = json[key];
    if (notes === undefined) continue;
    if (!isObject(notes) || !Object.values(notes).every((v) => typeof v === 'string')) {
      throw new Error(`${where}: "${key}" must map ids to strings`);
    }
    const stray = Object.keys(notes).filter((id) => !ids.has(id));
    if (stray.length > 0) throw new Error(`${where}: "${key}" has note(s) for id(s) not ${what}: ${stray.join(', ')}`);
  }

  const addKeys = new Set(Object.keys(PLACE_FIELDS));
  const addedIds = new Set<string>();
  for (const [i, p] of json.added.entries()) {
    if (!isObject(p)) throw new Error(`${where}: added[${i}] must be an object`);
    const label = `${where} added[${i}]${typeof p.id === 'string' ? ` (${p.id})` : ''}`;
    checkFields(label, p, addKeys);
    if (typeof p.id !== 'string' || !p.id) throw new Error(`${label}: id is required`);
    if (typeof p.nameSr !== 'string' || !p.nameSr) throw new Error(`${label}: nameSr is required`);
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') throw new Error(`${label}: lat and lon are required numbers`);
    checkDesignations(label, p.designations);
    if (addedIds.has(p.id)) throw new Error(`${where}: added has the id ${p.id} more than once`);
    addedIds.add(p.id);
  }
  return json as unknown as Overrides;
}

export interface OverrideContext {
  /** Area lookup for patched coordinates and added places (pipeline/areas.ts makeAssigner). */
  assign: (p: { lat: number; lon: number }) => AreaAssignment;
  kosovo: GeoJSON.Feature;
  /** Ids the pipeline dropped before overrides, with the reason, for clearer errors. */
  dropped?: Map<string, string>;
  /** Albanian name from Wikidata, used when a moved place ends up in Kosovo. */
  nameSqFor?: (id: string) => string | undefined;
}

const kindFor = (ds: Designation[]): Place['kind'] =>
  ds.every((d) => NATURE_DESIGNATIONS.has(d)) ? 'nature' : 'culture';

/** Re-derive what a patch invalidates: tier/kind from designations, area/inKosovo from lat/lon. */
function rederive(p: Place, patch: PlacePatch, ctx: OverrideContext | undefined): Place {
  if ('designations' in patch) {
    if (!('tier' in patch)) p.tier = tierFor(p.designations);
    if (!('kind' in patch)) p.kind = kindFor(p.designations);
  }
  if ('lat' in patch || 'lon' in patch) {
    if (!ctx) throw new Error(`Override moves ${p.id}: an area context is needed to recompute its area`);
    const area = ctx.assign(p);
    if (!('districtId' in patch)) p.districtId = area.districtId;
    if (!('municipalityId' in patch)) p.municipalityId = area.municipalityId;
    if (!('inKosovo' in patch)) p.inKosovo = area.inKosovo ?? isInKosovo(p, ctx.kosovo);
  }
  // nameSq is shown only in Kosovo: follow inKosovo unless the patch sets it
  if (!('nameSq' in patch)) {
    const sq = p.inKosovo ? (p.nameSq ?? ctx?.nameSqFor?.(p.id)) : undefined;
    if (sq === undefined) delete p.nameSq;
    else p.nameSq = sq;
  }
  return p;
}

function completeAdded(a: AddedPlace, ctx: OverrideContext | undefined): Place {
  const needsArea = !('districtId' in a && 'municipalityId' in a && 'inKosovo' in a);
  if (needsArea && !ctx) throw new Error(`Override adds ${a.id}: an area context is needed to derive its area`);
  const area = needsArea && ctx ? ctx.assign(a) : undefined;
  const place: Place = {
    kind: kindFor(a.designations),
    tier: tierFor(a.designations),
    districtId: area?.districtId ?? null,
    municipalityId: area?.municipalityId ?? null,
    inKosovo: area ? (area.inKosovo ?? isInKosovo(a, ctx!.kosovo)) : false,
    access: null,
    ...a,
  };
  return place;
}

function unknownId(verb: string, id: string, ctx: OverrideContext | undefined): Error {
  const reason = ctx?.dropped?.get(id);
  return new Error(reason
    ? `Override ${verb} ${id}, which the pipeline dropped earlier (${reason})`
    : `Override ${verb} unknown place id: ${id}`);
}

/**
 * Patch, add and remove places, then re-derive fields the patch invalidates (unless it sets them too).
 * Unknown ids throw (they are almost always typos).
 */
export function applyOverrides(places: Place[], o: Overrides, ctx?: OverrideContext): Place[] {
  const ids = new Set(places.map((p) => p.id));
  for (const id of Object.keys(o.places)) {
    if (!ids.has(id)) throw unknownId('patches', id, ctx);
  }
  for (const id of o.removed) {
    if (!ids.has(id)) throw unknownId('removes', id, ctx);
  }
  for (const p of o.added) {
    if (ids.has(p.id)) throw new Error(`Override adds a place with an existing id: ${p.id}`);
  }
  const removed = new Set(o.removed);
  const patched = places
    .filter((p) => !removed.has(p.id))
    .map((p) => {
      const patch = o.places[p.id];
      if (!patch) return p;
      const next: Place = { ...p, ...patch, id: p.id };
      // a hand-set access value is a fact, not an estimate
      if ('access' in patch && !('accessEstimated' in patch)) delete next.accessEstimated;
      return rederive(next, patch, ctx);
    });
  return [...patched, ...o.added.map((a) => completeAdded(a, ctx))];
}
