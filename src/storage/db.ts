import { openDB, type IDBPDatabase } from 'idb';

export interface Visit { placeId: string; date: string; note: string; photoIds: string[] }
export interface StoredPhoto { id: string; placeId: string; blob: Blob; createdAt: string }
export interface TripState { stopIds: string[]; startPlaceId: string | null } // null = Google uses current location

export class StorageUnavailableError extends Error {
  /** True when the underlying failure was a full-storage (quota) error. */
  readonly quota: boolean;
  constructor(message = 'Local storage is unavailable', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageUnavailableError';
    this.quota = (options?.cause as { name?: string } | undefined)?.name === 'QuotaExceededError';
  }
}

const DB_NAME = 'serbia-explored';

/** Photo bytes are persisted as ArrayBuffer + type so they survive structured clone in every environment. */
interface PhotoRecord { id: string; placeId: string; createdAt: string; type: string; data: ArrayBuffer }

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    // async wrapper so a synchronous throw (e.g. indexedDB undefined) is also converted
    dbPromise = (async () => {
      try {
        return await openDB(DB_NAME, 1, {
          upgrade(db) {
            db.createObjectStore('visits', { keyPath: 'placeId' });
            db.createObjectStore('photos', { keyPath: 'id' });
            db.createObjectStore('meta');
          },
        });
      } catch (e) {
        dbPromise = null;
        throw new StorageUnavailableError('Could not open local storage', { cause: e });
      }
    })();
  }
  return dbPromise;
}

async function run<T>(fn: (db: IDBPDatabase) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await fn(db);
  } catch (e) {
    if (e instanceof StorageUnavailableError) throw e;
    throw new StorageUnavailableError('Local storage operation failed', { cause: e });
  }
}

export function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

async function toRecord(p: StoredPhoto): Promise<PhotoRecord> {
  return { id: p.id, placeId: p.placeId, createdAt: p.createdAt, type: p.blob.type, data: await readBlobBytes(p.blob) };
}
function fromRecord(r: PhotoRecord): StoredPhoto {
  return { id: r.id, placeId: r.placeId, createdAt: r.createdAt, blob: new Blob([r.data], { type: r.type }) };
}

export function getAllVisits(): Promise<Visit[]> {
  return run((db) => db.getAll('visits'));
}
export async function putVisit(v: Visit): Promise<void> {
  await run((db) => db.put('visits', v));
}
export async function deleteVisit(placeId: string): Promise<void> {
  await run(async (db) => {
    const tx = db.transaction(['visits', 'photos'], 'readwrite');
    const photos = (await tx.objectStore('photos').getAll()) as PhotoRecord[];
    for (const p of photos) if (p.placeId === placeId) await tx.objectStore('photos').delete(p.id);
    await tx.objectStore('visits').delete(placeId);
    await tx.done;
  });
}
export async function putPhoto(p: StoredPhoto): Promise<void> {
  await run(async (db) => db.put('photos', await toRecord(p)));
}
export async function getPhoto(id: string): Promise<StoredPhoto | undefined> {
  const rec = (await run((db) => db.get('photos', id))) as PhotoRecord | undefined;
  return rec ? fromRecord(rec) : undefined;
}
export async function deletePhoto(id: string): Promise<void> {
  await run((db) => db.delete('photos', id));
}
export async function getAllPhotos(): Promise<StoredPhoto[]> {
  const recs = (await run((db) => db.getAll('photos'))) as PhotoRecord[];
  return recs.map(fromRecord);
}
export function getMeta<T>(key: 'trip' | 'settings'): Promise<T | undefined> {
  return run((db) => db.get('meta', key) as Promise<T | undefined>);
}
export async function setMeta<T>(key: 'trip' | 'settings', value: T): Promise<void> {
  await run((db) => db.put('meta', value, key));
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Test helper: closes the cached connection and deletes the database. */
export async function __resetDbForTests(): Promise<void> {
  if (dbPromise) {
    try { (await dbPromise).close(); } catch { /* ignore */ }
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
