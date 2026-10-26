import type { Settings } from '../logic/filters';
import { todayLocal } from '../logic/date';
import {
  getAllVisits, getAllPhotos, getMeta, putVisit, putPhoto, deletePhoto, setMeta,
  readBlobBytes, type Visit, type TripState,
} from './db';

const FORMAT = 'serbia-explored-backup';
const VERSION = 1;

export class BackupFormatError extends Error {
  constructor(message = 'Not a Serbia Explored backup file') {
    super(message);
    this.name = 'BackupFormatError';
  }
}

export interface ImportResult { visitsImported: number; photosImported: number; tripImported: boolean }

interface BackupPhoto { id: string; placeId: string; createdAt: string; type: string; dataBase64: string }
interface Backup {
  format: typeof FORMAT; version: number; exportedAt: string;
  visits: Visit[]; photos: BackupPhoto[]; trip: TripState | null; settings: Settings | null;
}

export function backupFileName(now: Date = new Date()): string {
  return `serbia-explored-backup-${todayLocal(now)}.json`;
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function exportBackup(): Promise<Blob> {
  const [visits, photos, trip, settings] = await Promise.all([
    getAllVisits(), getAllPhotos(), getMeta<TripState>('trip'), getMeta<Settings>('settings'),
  ]);
  const outPhotos: BackupPhoto[] = [];
  for (const p of photos) {
    outPhotos.push({
      id: p.id, placeId: p.placeId, createdAt: p.createdAt, type: p.blob.type,
      dataBase64: bytesToBase64(await readBlobBytes(p.blob)),
    });
  }
  const data: Backup = {
    format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(),
    visits, photos: outPhotos, trip: trip ?? null, settings: settings ?? null,
  };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

async function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

async function parseBackup(file: Blob): Promise<Backup> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readText(file));
  } catch {
    throw new BackupFormatError('Backup file is not valid JSON');
  }
  if (!isObj(raw) || raw.format !== FORMAT) throw new BackupFormatError();
  if (typeof raw.version !== 'number' || raw.version > VERSION || raw.version < 1) {
    throw new BackupFormatError('Unsupported backup version');
  }
  if (!Array.isArray(raw.visits) || !Array.isArray(raw.photos)) throw new BackupFormatError('Backup is incomplete');
  for (const v of raw.visits) {
    if (!isObj(v) || !isStr(v.placeId) || !isStr(v.date) || !isStr(v.note)
      || !Array.isArray(v.photoIds) || !v.photoIds.every(isStr)) throw new BackupFormatError('Backup contains an invalid visit');
  }
  for (const p of raw.photos) {
    if (!isObj(p) || !isStr(p.id) || !isStr(p.placeId) || !isStr(p.createdAt) || !isStr(p.type) || !isStr(p.dataBase64)) {
      throw new BackupFormatError('Backup contains an invalid photo');
    }
    try { atob(p.dataBase64); } catch { throw new BackupFormatError('Backup contains corrupt photo data'); }
  }
  const trip = raw.trip ?? null;
  if (trip !== null && (!isObj(trip) || !Array.isArray(trip.stopIds) || !trip.stopIds.every(isStr)
    || !(trip.startPlaceId === null || isStr(trip.startPlaceId)))) throw new BackupFormatError('Backup contains an invalid trip');
  const settings = raw.settings ?? null;
  if (settings !== null && !isObj(settings)) throw new BackupFormatError('Backup contains invalid settings');
  return raw as unknown as Backup;
}

/** Validates exactly like importBackup but writes nothing. */
export async function readBackupSummary(file: Blob): Promise<{ visits: number; photos: number }> {
  const b = await parseBackup(file);
  return { visits: b.visits.length, photos: b.photos.length };
}

export async function importBackup(file: Blob): Promise<ImportResult> {
  const b = await parseBackup(file);
  // Everything is validated; writes start here.
  const existing = await getAllVisits();
  const existingByPlace = new Map(existing.map((v) => [v.placeId, v]));
  const backupPhotoIds = new Set(b.photos.map((p) => p.id));

  for (const v of b.visits) {
    const old = existingByPlace.get(v.placeId);
    if (old) for (const id of old.photoIds) if (!backupPhotoIds.has(id)) await deletePhoto(id);
    await putVisit(v);
  }
  for (const p of b.photos) {
    await putPhoto({
      id: p.id, placeId: p.placeId, createdAt: p.createdAt,
      blob: new Blob([base64ToBytes(p.dataBase64)], { type: p.type }),
    });
  }
  let tripImported = false;
  if (b.trip) { await setMeta('trip', b.trip); tripImported = true; }
  if (b.settings) await setMeta('settings', b.settings);
  return { visitsImported: b.visits.length, photosImported: b.photos.length, tripImported };
}
