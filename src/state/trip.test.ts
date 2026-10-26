import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/db', async () => {
  class StorageUnavailableError extends Error { readonly quota = false; }
  return {
    StorageUnavailableError,
    getAllVisits: vi.fn(), putVisit: vi.fn(), deleteVisit: vi.fn(), putPhoto: vi.fn(), getPhoto: vi.fn(),
    deletePhoto: vi.fn(), getMeta: vi.fn(), setMeta: vi.fn(async () => undefined), requestPersistence: vi.fn(async () => true),
  };
});

import { useApp } from './store';
import type { Place } from '../shared/types';

const initial = useApp.getState();
const mk = (id: string, lat: number, lon: number, inKosovo = false): Place => ({
  id, nameSr: id, kind: 'culture', tier: 1, designations: [], lat, lon,
  districtId: null, municipalityId: null, inKosovo, access: null,
});

function load(places: Place[]) {
  useApp.setState({ places, placesById: new Map(places.map((p) => [p.id, p])) });
}

beforeEach(() => {
  useApp.setState(initial, true);
});

describe('trip rules', () => {
  it('adding the same id twice leaves one stop', () => {
    load([mk('a', 44, 20)]);
    useApp.getState().addToTrip('a');
    useApp.getState().addToTrip('a');
    expect(useApp.getState().trip.stopIds).toEqual(['a']);
  });

  it('a 10th stop is refused with a tripFull toast', () => {
    const ps = Array.from({ length: 10 }, (_, i) => mk(`p${i}`, 43 + i * 0.1, 20));
    load(ps);
    ps.forEach((p) => useApp.getState().addToTrip(p.id));
    expect(useApp.getState().trip.stopIds).toHaveLength(9);
    expect(useApp.getState().toast?.key).toBe('tripFull');
  });

  it('re-orders on add, starting from the start place', () => {
    load([mk('far', 44, 23), mk('near', 44, 21), mk('start', 44, 20), mk('mid', 44, 22)]);
    useApp.getState().setTripStart('start');
    ['far', 'near', 'mid'].forEach((id) => useApp.getState().addToTrip(id));
    expect(useApp.getState().trip.stopIds).toEqual(['near', 'mid', 'far']);
  });

  it('moveTripStop swaps without re-ordering', () => {
    load([mk('a', 44, 20), mk('b', 44, 21), mk('c', 44, 22)]);
    ['a', 'b', 'c'].forEach((id) => useApp.getState().addToTrip(id));
    useApp.getState().moveTripStop('a', 1);
    expect(useApp.getState().trip.stopIds).toEqual(['b', 'a', 'c']);
  });

  it('hiding Kosovo keeps a Kosovo stop', () => {
    load([mk('k', 42.6, 20.9, true)]);
    useApp.getState().addToTrip('k');
    useApp.getState().setSettings({ kosovoShown: false });
    expect(useApp.getState().trip.stopIds).toEqual(['k']);
  });
});
