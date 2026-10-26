import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  putVisit, getAllVisits, deleteVisit, putPhoto, getPhoto, deletePhoto, getMeta, setMeta,
  requestPersistence, __resetDbForTests, StorageUnavailableError,
} from './db';

const photo = (id: string, placeId: string) => ({
  id, placeId, createdAt: '2026-10-26T10:00:00Z', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
});

beforeEach(async () => { await __resetDbForTests(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('db', () => {
  it('round-trips visits', async () => {
    await putVisit({ placeId: 'Q1', date: '2026-10-26', note: 'hi', photoIds: [] });
    expect(await getAllVisits()).toEqual([{ placeId: 'Q1', date: '2026-10-26', note: 'hi', photoIds: [] }]);
  });
  it('deleteVisit also removes its photos, not others', async () => {
    await putVisit({ placeId: 'Q1', date: 'd', note: '', photoIds: ['a'] });
    await putPhoto(photo('a', 'Q1'));
    await putPhoto(photo('b', 'Q2'));
    await deleteVisit('Q1');
    expect(await getAllVisits()).toEqual([]);
    expect(await getPhoto('a')).toBeUndefined();
    expect(await getPhoto('b')).toBeDefined();
  });
  it('stores photo bytes and type', async () => {
    await putPhoto(photo('a', 'Q1'));
    const p = await getPhoto('a');
    expect(p!.blob.type).toBe('image/jpeg');
    expect(p!.blob.size).toBe(3);
    await deletePhoto('a');
    expect(await getPhoto('a')).toBeUndefined();
  });
  it('stores meta', async () => {
    expect(await getMeta('trip')).toBeUndefined();
    await setMeta('trip', { stopIds: ['Q1'], startPlaceId: null });
    expect(await getMeta('trip')).toEqual({ stopIds: ['Q1'], startPlaceId: null });
  });
  it('requestPersistence returns false when unsupported', async () => {
    expect(await requestPersistence()).toBe(false);
  });

  it('wraps a missing indexedDB in StorageUnavailableError', async () => {
    await __resetDbForTests();
    vi.stubGlobal('indexedDB', undefined);
    const err = await getAllVisits().catch((e) => e);
    expect(err).toBeInstanceOf(StorageUnavailableError);
    expect(err.quota).toBe(false);
  });

  it('wraps a failing transaction and keeps the cause', async () => {
    await putVisit({ placeId: 'Q1', date: 'd', note: '', photoIds: [] });
    const cause = new DOMException('full', 'QuotaExceededError');
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw cause; });
    const err = await putVisit({ placeId: 'Q2', date: 'd', note: '', photoIds: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(StorageUnavailableError);
    expect(err.cause).toBe(cause);
    expect(err.quota).toBe(true);
  });

  it('wraps a failing blob read in putPhoto', async () => {
    const bad = { type: 'image/jpeg', arrayBuffer: () => Promise.reject(new Error('read failed')) } as unknown as Blob;
    const err = await putPhoto({ id: 'x', placeId: 'Q1', createdAt: 't', blob: bad }).catch((e) => e);
    expect(err).toBeInstanceOf(StorageUnavailableError);
    expect(err.quota).toBe(false);
  });
});
