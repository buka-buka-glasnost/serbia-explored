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

describe('settings', () => {
  it('merges and persists', () => {
    useApp.getState().setSettings({ kosovoShown: false });
    expect(useApp.getState().settings.kosovoShown).toBe(false);
    expect(db.setMeta).toHaveBeenCalledWith('settings', expect.objectContaining({ kosovoShown: false }));
  });
});
