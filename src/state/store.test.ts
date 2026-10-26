import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/db', async () => {
  class StorageUnavailableError extends Error {
    readonly quota = false;
  }
  return {
    StorageUnavailableError,
    getAllVisits: vi.fn(),
    putVisit: vi.fn(),
    deleteVisit: vi.fn(),
    putPhoto: vi.fn(),
    getPhoto: vi.fn(),
    deletePhoto: vi.fn(),
    getMeta: vi.fn(),
    setMeta: vi.fn(),
    requestPersistence: vi.fn(async () => true),
  };
});
vi.mock('../storage/photos', async (orig) => ({
  ...(await orig<typeof import('../storage/photos')>()),
  resizeImage: vi.fn(async (f: Blob) => f),
}));
vi.mock('../data/loadData', () => ({
  loadPlaces: vi.fn(async () => [
    { id: 'Q1', nameSr: 'А', kind: 'culture', tier: 1, designations: [], lat: 44, lon: 21, districtId: null, municipalityId: null, inKosovo: false, access: null },
    { id: 'Q2', nameSr: 'Б', kind: 'nature', tier: 2, designations: [], lat: 45, lon: 20, districtId: null, municipalityId: null, inKosovo: false, access: null },
  ]),
  loadAreas: vi.fn(async () => ({ type: 'FeatureCollection', features: [] })),
  loadKosovoOutline: vi.fn(async () => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } })),
}));

import * as db from '../storage/db';
import { useApp } from './store';

const initial = useApp.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useApp.setState(initial, true);
  vi.mocked(db.getAllVisits).mockResolvedValue([]);
  vi.mocked(db.getMeta).mockResolvedValue(undefined);
  vi.mocked(db.putVisit).mockResolvedValue();
  vi.mocked(db.setMeta).mockResolvedValue();
});

describe('init', () => {
  it('reaches ready with storageOk false when storage is unavailable', async () => {
    vi.mocked(db.getAllVisits).mockRejectedValue(new db.StorageUnavailableError());
    await useApp.getState().init();
    const s = useApp.getState();
    expect(s.status).toBe('ready');
    expect(s.storageOk).toBe(false);
    expect(s.places).toHaveLength(2);
  });

  it('shares one load when called twice at once (StrictMode)', async () => {
    const loadData = await import('../data/loadData');
    const s = useApp.getState();
    await Promise.all([s.init(), s.init()]);
    expect(loadData.loadPlaces).toHaveBeenCalledTimes(1);
    expect(db.getAllVisits).toHaveBeenCalledTimes(1);
    await useApp.getState().init(); // a later call (e.g. Retry) loads again
    expect(loadData.loadPlaces).toHaveBeenCalledTimes(2);
  });

  it('loads stored visits, trip and settings', async () => {
    vi.mocked(db.getAllVisits).mockResolvedValue([{ placeId: 'Q1', date: '2026-01-01', note: '', photoIds: [] }]);
    vi.mocked(db.getMeta).mockImplementation((async (k: string) =>
      k === 'trip' ? { stopIds: ['Q2'], startPlaceId: null } : undefined) as never);
    await useApp.getState().init();
    expect(useApp.getState().visits.Q1).toBeDefined();
    expect(useApp.getState().trip.stopIds).toEqual(['Q2']);
    expect(useApp.getState().storageOk).toBe(true);
  });
});

describe('markVisited', () => {
  it('saves the visit and requests persistence', async () => {
    await useApp.getState().markVisited('Q1');
    expect(useApp.getState().visits.Q1).toMatchObject({ placeId: 'Q1', note: '', photoIds: [] });
    expect(db.putVisit).toHaveBeenCalled();
    expect(db.requestPersistence).toHaveBeenCalled();
  });

  it('rolls back and shows an error toast when saving fails', async () => {
    vi.mocked(db.putVisit).mockRejectedValue(new Error('boom'));
    await useApp.getState().markVisited('Q1');
    expect(useApp.getState().visits.Q1).toBeUndefined();
    expect(useApp.getState().toast).toEqual({ key: 'storageError', kind: 'error' });
  });
});

describe('trip', () => {
  it('adds without duplicates, moves, removes and persists', () => {
    const s = useApp.getState();
    s.addToTrip('Q1'); s.addToTrip('Q2'); s.addToTrip('Q1');
    expect(useApp.getState().trip.stopIds).toEqual(['Q1', 'Q2']);
    useApp.getState().moveTripStop('Q2', -1);
    expect(useApp.getState().trip.stopIds).toEqual(['Q2', 'Q1']);
    useApp.getState().moveTripStop('Q2', -1);
    expect(useApp.getState().trip.stopIds).toEqual(['Q2', 'Q1']);
    useApp.getState().removeFromTrip('Q2');
    expect(useApp.getState().trip.stopIds).toEqual(['Q1']);
    useApp.getState().setTripStart('Q1');
    expect(useApp.getState().trip.startPlaceId).toBe('Q1');
    expect(db.setMeta).toHaveBeenLastCalledWith('trip', { stopIds: ['Q1'], startPlaceId: 'Q1' });
  });
});

describe('addPhoto', () => {
  it('refuses a sixth photo with a toast and stores nothing', async () => {
    useApp.setState({ visits: { Q1: { placeId: 'Q1', date: '2026-01-01', note: '', photoIds: ['a', 'b', 'c', 'd', 'e'] } } });
    await useApp.getState().addPhoto('Q1', new File(['x'], 'x.jpg'));
    expect(useApp.getState().visits.Q1.photoIds).toHaveLength(5);
    expect(useApp.getState().toast).toEqual({ key: 'tooManyPhotos', kind: 'info' });
    expect(db.putPhoto).not.toHaveBeenCalled();
  });
});

describe('actions never reject on storage failure', () => {
  const visit = { placeId: 'Q1', date: '2026-01-01', note: '', photoIds: ['a'] };
  beforeEach(() => {
    const boom = new Error('boom');
    vi.mocked(db.putVisit).mockRejectedValue(boom);
    vi.mocked(db.deleteVisit).mockRejectedValue(boom);
    vi.mocked(db.putPhoto).mockRejectedValue(boom);
    vi.mocked(db.deletePhoto).mockRejectedValue(boom);
    useApp.setState({ visits: { Q1: visit } });
  });
  const failsQuietly = async (action: () => Promise<void>) => {
    await expect(action()).resolves.toBeUndefined();
    expect(useApp.getState().toast).toEqual({ key: 'storageError', kind: 'error' });
    expect(useApp.getState().visits.Q1).toEqual(visit);
  };

  it('markVisited', async () => {
    await failsQuietly(() => useApp.getState().markVisited('Q2'));
    expect(useApp.getState().visits.Q2).toBeUndefined();
  });
  it('updateVisit', () => failsQuietly(() => useApp.getState().updateVisit('Q1', { note: 'x' })));
  it('addPhoto', () => failsQuietly(() => useApp.getState().addPhoto('Q1', new File(['x'], 'x.jpg'))));
  it('removePhoto', () => failsQuietly(() => useApp.getState().removePhoto('Q1', 'a')));
  it('unmarkVisited', () => failsQuietly(() => useApp.getState().unmarkVisited('Q1')));
});

/** A promise with its resolve/reject exposed, for controlling when a mocked write settles. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('overlapping writes', () => {
  const visit = { placeId: 'Q1', date: '2026-01-01', note: '', photoIds: [] };
  beforeEach(() => useApp.setState({ visits: { Q1: visit } }));

  it('a failed date write does not undo a later note write that succeeded', async () => {
    vi.mocked(db.putVisit).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce();
    const s = useApp.getState();
    const date = s.updateVisit('Q1', { date: '2026-02-02' });
    const note = s.updateVisit('Q1', { note: 'hello' });
    await Promise.all([date, note]);
    expect(useApp.getState().visits.Q1).toEqual({ ...visit, date: '2026-02-02', note: 'hello' });
    expect(db.putVisit).toHaveBeenLastCalledWith({ ...visit, date: '2026-02-02', note: 'hello' });
  });

  it('when both writes fail, rolls back to what is stored', async () => {
    vi.mocked(db.putVisit).mockRejectedValue(new Error('boom'));
    const s = useApp.getState();
    await Promise.all([s.updateVisit('Q1', { date: '2026-02-02' }), s.updateVisit('Q1', { note: 'hello' })]);
    expect(useApp.getState().visits.Q1).toEqual(visit);
  });

  it('a failed update does not bring back a visit that was unmarked meanwhile', async () => {
    const put = deferred();
    vi.mocked(db.putVisit).mockReturnValueOnce(put.promise);
    vi.mocked(db.deleteVisit).mockResolvedValue();
    const s = useApp.getState();
    const update = s.updateVisit('Q1', { note: 'x' });
    const unmark = s.unmarkVisited('Q1');
    put.reject(new Error('boom'));
    await Promise.all([update, unmark]);
    expect(useApp.getState().visits.Q1).toBeUndefined();
    expect(db.deleteVisit).toHaveBeenCalledWith('Q1');
  });

  it('writes reach storage in the order they were made', async () => {
    const first = deferred();
    vi.mocked(db.putVisit).mockReturnValueOnce(first.promise);
    vi.mocked(db.deleteVisit).mockResolvedValue();
    const s = useApp.getState();
    const update = s.updateVisit('Q1', { note: 'x' });
    const unmark = s.unmarkVisited('Q1');
    await Promise.resolve();
    expect(db.deleteVisit).not.toHaveBeenCalled(); // waits for the put
    first.resolve();
    await Promise.all([update, unmark]);
    expect(db.deleteVisit).toHaveBeenCalledWith('Q1');
  });
});

describe('addPhoto while the visit changes', () => {
  const visit = { placeId: 'Q1', date: '2026-01-01', note: '', photoIds: [] as string[] };
  beforeEach(() => {
    useApp.setState({ visits: { Q1: visit } });
    vi.mocked(db.deleteVisit).mockResolvedValue();
    vi.mocked(db.deletePhoto).mockResolvedValue();
  });

  it('does not resurrect a visit unmarked before the photo was stored', async () => {
    const stored = deferred();
    vi.mocked(db.putPhoto).mockReturnValueOnce(stored.promise);
    const adding = useApp.getState().addPhoto('Q1', new File(['x'], 'x.jpg'));
    await useApp.getState().unmarkVisited('Q1');
    stored.resolve();
    await adding;
    expect(useApp.getState().visits.Q1).toBeUndefined();
    expect(db.putVisit).not.toHaveBeenCalled();
    const photoId = vi.mocked(db.putPhoto).mock.calls[0][0].id;
    expect(db.deletePhoto).toHaveBeenCalledWith(photoId);
  });

  it('keeps a note saved while the photo was being stored', async () => {
    const stored = deferred();
    vi.mocked(db.putPhoto).mockReturnValueOnce(stored.promise);
    const adding = useApp.getState().addPhoto('Q1', new File(['x'], 'x.jpg'));
    await useApp.getState().updateVisit('Q1', { note: 'kept' });
    stored.resolve();
    await adding;
    expect(useApp.getState().visits.Q1).toMatchObject({ note: 'kept', photoIds: [expect.any(String)] });
  });

  it('re-checks the photo limit after storing (two quick picks)', async () => {
    useApp.setState({ visits: { Q1: { ...visit, photoIds: ['a', 'b', 'c', 'd'] } } });
    vi.mocked(db.putPhoto).mockResolvedValue();
    const s = useApp.getState();
    await Promise.all([s.addPhoto('Q1', new File(['x'], 'x.jpg')), s.addPhoto('Q1', new File(['y'], 'y.jpg'))]);
    expect(useApp.getState().visits.Q1.photoIds).toHaveLength(5);
    expect(db.deletePhoto).toHaveBeenCalledTimes(1);
    expect(useApp.getState().toast).toEqual({ key: 'tooManyPhotos', kind: 'info' });
  });
});

describe('settings', () => {
  it('merges and persists', () => {
    useApp.getState().setSettings({ kosovoShown: false });
    expect(useApp.getState().settings.kosovoShown).toBe(false);
    expect(db.setMeta).toHaveBeenCalledWith('settings', expect.objectContaining({ kosovoShown: false }));
  });
});
