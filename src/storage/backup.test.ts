import { describe, it, expect, beforeEach } from 'vitest';
import {
  putVisit, getAllVisits, putPhoto, getPhoto, getMeta, setMeta, __resetDbForTests, readBlobBytes,
} from './db';
import { exportBackup, importBackup, readBackupSummary, backupFileName, BackupFormatError } from './backup';

const blobOf = (o: unknown) => new Blob([JSON.stringify(o)], { type: 'application/json' });
const bytes = [0, 1, 2, 250, 255, 128, 7];
const mkPhoto = (id: string, placeId: string) => ({
  id, placeId, createdAt: '2026-10-26T10:00:00Z', blob: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
});

beforeEach(async () => { await __resetDbForTests(); });

describe('backup', () => {
  it('names the file by local date', () => {
    expect(backupFileName(new Date(2026, 9, 27, 0, 30))).toBe('serbia-explored-backup-2026-10-27.json');
  });

  it('round-trips visits, photo bytes, trip and unknown place ids', async () => {
    await putVisit({ placeId: 'Q1', date: '2026-10-01', note: 'one', photoIds: ['p1'] });
    await putVisit({ placeId: 'Q999999999', date: '2026-10-02', note: 'unknown', photoIds: [] });
    await putPhoto(mkPhoto('p1', 'Q1'));
    await setMeta('trip', { stopIds: ['Q1'], startPlaceId: 'Q1' });
    const file = await exportBackup();

    await __resetDbForTests();
    expect(await getAllVisits()).toEqual([]);
    const res = await importBackup(file);
    expect(res).toEqual({ visitsImported: 2, photosImported: 1, tripImported: true });

    const visits = (await getAllVisits()).sort((a, b) => a.placeId.localeCompare(b.placeId));
    expect(visits.map((v) => v.placeId)).toEqual(['Q1', 'Q999999999']);
    const p = await getPhoto('p1');
    expect(p!.blob.type).toBe('image/jpeg');
    expect(Array.from(new Uint8Array(await readBlobBytes(p!.blob)))).toEqual(bytes);
    expect(await getMeta('trip')).toEqual({ stopIds: ['Q1'], startPlaceId: 'Q1' });
  });

  it('rejects wrong format without touching data', async () => {
    await putVisit({ placeId: 'Q1', date: 'd', note: 'keep', photoIds: [] });
    await expect(importBackup(blobOf({ format: 'other' }))).rejects.toBeInstanceOf(BackupFormatError);
    expect((await getAllVisits())[0].note).toBe('keep');
  });

  it('rejects version 2, bad JSON and invalid entries with no writes', async () => {
    await putVisit({ placeId: 'Q1', date: 'd', note: 'keep', photoIds: [] });
    const base = { format: 'serbia-explored-backup', exportedAt: 'x', visits: [], photos: [], trip: null, settings: null };
    await expect(importBackup(blobOf({ ...base, version: 2 }))).rejects.toBeInstanceOf(BackupFormatError);
    await expect(importBackup(new Blob(['not json']))).rejects.toBeInstanceOf(BackupFormatError);
    await expect(importBackup(blobOf({
      ...base, version: 1,
      visits: [{ placeId: 'Q1', date: 'd', note: 'overwritten', photoIds: [] }, { placeId: 5 }],
    }))).rejects.toBeInstanceOf(BackupFormatError);
    expect(await getAllVisits()).toEqual([{ placeId: 'Q1', date: 'd', note: 'keep', photoIds: [] }]);
  });

  it('backup wins on conflict and drops replaced visit photos missing from backup', async () => {
    await putVisit({ placeId: 'Q1', date: '2026-10-01', note: 'new', photoIds: ['keep'] });
    await putPhoto(mkPhoto('keep', 'Q1'));
    const file = await exportBackup();
    await putVisit({ placeId: 'Q1', date: '2026-10-05', note: 'local', photoIds: ['old'] });
    await putPhoto(mkPhoto('old', 'Q1'));
    await putVisit({ placeId: 'Q2', date: 'd', note: 'other', photoIds: ['q2p'] });
    await putPhoto(mkPhoto('q2p', 'Q2'));

    await importBackup(file);
    const visits = await getAllVisits();
    expect(visits.find((v) => v.placeId === 'Q1')!.note).toBe('new');
    expect(visits.find((v) => v.placeId === 'Q2')!.note).toBe('other');
    expect(await getPhoto('keep')).toBeDefined();
    expect(await getPhoto('old')).toBeUndefined();
    expect(await getPhoto('q2p')).toBeDefined();
  });

  it('readBackupSummary counts and validates without writing', async () => {
    await putVisit({ placeId: 'Q1', date: 'd', note: 'a', photoIds: ['p1'] });
    await putPhoto(mkPhoto('p1', 'Q1'));
    const file = await exportBackup();
    await __resetDbForTests();
    expect(await readBackupSummary(file)).toEqual({ visits: 1, photos: 1 });
    expect(await getAllVisits()).toEqual([]);
    await expect(readBackupSummary(blobOf({ format: 'other' }))).rejects.toBeInstanceOf(BackupFormatError);
    await expect(readBackupSummary(blobOf({ format: 'serbia-explored-backup', version: 2 }))).rejects.toBeInstanceOf(BackupFormatError);
    await expect(readBackupSummary(new Blob(['{']))).rejects.toBeInstanceOf(BackupFormatError);
  });
});
