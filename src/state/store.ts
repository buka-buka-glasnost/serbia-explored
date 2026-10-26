import { create } from 'zustand';
import type { AreaFC, Place } from '../shared/types';
import type { StringKey } from '../i18n/strings';
import { detectLang } from '../i18n/i18n';
import { DEFAULT_SETTINGS, type Settings } from '../logic/filters';
import { todayLocal } from '../logic/date';
import { areaAt } from '../logic/areas';
import { loadAreas, loadPlaces } from '../data/loadData';
import {
  StorageUnavailableError,
  deletePhoto,
  deleteVisit,
  getAllVisits,
  getMeta,
  putPhoto,
  putVisit,
  requestPersistence,
  setMeta,
  type TripState,
  type Visit,
} from '../storage/db';
import { MAX_PHOTOS_PER_VISIT, resizeImage } from '../storage/photos';
import { MAX_TRIP_STOPS, orderStops } from '../trip/order';

export type AreaFeature = AreaFC['features'][number];

export interface AppState {
  status: 'loading' | 'ready' | 'error';
  places: Place[]; placesById: Map<string, Place>;
  areas: AreaFC | null; areasById: Map<string, AreaFeature>;
  visits: Record<string, Visit>; trip: TripState; settings: Settings;
  /** Bumped when stored data is reloaded (backup import), so editors re-read it. */
  dataVersion: number;
  selectedId: string | null; areaId: string | null; query: string;
  picking: boolean;
  welcomeOpen: boolean;
  toast: { key: StringKey; kind: 'info' | 'error' } | null;
  storageOk: boolean;
  init(): Promise<void>;
  /** Re-reads visits, trip and settings from storage (after a backup import). */
  reloadFromStorage(): Promise<void>;
  select(id: string | null): void;
  setQuery(q: string): void;
  setSettings(patch: Partial<Settings>): void;
  setArea(id: string | null): void;
  setPicking(on: boolean): void;
  /** Picking mode: selects the area under the point (municipality or district by zoom). */
  pickAreaAt(lat: number, lon: number, zoom: number): void;
  setWelcomeOpen(open: boolean): void;
  markVisited(id: string): Promise<void>;
  unmarkVisited(id: string): Promise<void>;
  updateVisit(id: string, patch: Partial<Pick<Visit, 'date' | 'note'>>): Promise<void>;
  addPhoto(id: string, file: File): Promise<void>;
  removePhoto(id: string, photoId: string): Promise<void>;
  addToTrip(id: string): void;
  removeFromTrip(id: string): void;
  moveTripStop(id: string, dir: -1 | 1): void;
  setTripStart(placeId: string | null): void;
  optimiseTrip(): void;
  showToast(key: StringKey, kind?: 'info' | 'error'): void;
}

const defaultSettings = (): Settings => ({
  ...DEFAULT_SETTINGS,
  lang: detectLang(typeof navigator === 'undefined' ? undefined : navigator.language),
});

let persistenceRequested = false;

/** `areas` together with its id index; the only way areas should enter the store. */
export const areaState = (areas: AreaFC | null) => ({
  areas,
  areasById: new Map((areas?.features ?? []).map((f) => [f.properties.id, f])),
});

/** The selected area's feature, or null. */
export const selectArea = (s: AppState): AreaFeature | null =>
  (s.areaId ? s.areasById.get(s.areaId) ?? null : null);

const EMPTY_TRIP: TripState = { stopIds: [], startPlaceId: null };

/** Drops trip ids of places that no longer exist in the data. */
function pruneTrip(trip: TripState | undefined, placesById: Map<string, Place>): TripState {
  if (!trip) return EMPTY_TRIP;
  const startPlaceId = trip.startPlaceId && placesById.has(trip.startPlaceId) ? trip.startPlaceId : null;
  return { stopIds: trip.stopIds.filter((id) => placesById.has(id)), startPlaceId };
}

export const useApp = create<AppState>((set, get) => {
  /** Saves settings/trip; failures surface as a toast but keep the in-memory value. */
  const persistMeta = (key: 'trip' | 'settings', value: unknown) => {
    if (!get().storageOk) return;
    setMeta(key, value).catch(() => get().showToast('storageError', 'error'));
  };

  const setTrip = (trip: TripState) => {
    set({ trip });
    persistMeta('trip', trip);
  };

  /** Stop ids re-ordered by nearest-neighbour + 2-opt, from the trip start if set. */
  const reorder = (stopIds: string[], startPlaceId: string | null): string[] => {
    const { placesById } = get();
    // The start is the route origin: it is not ordered, it just stays first if it is also a stop.
    const startIsStop = !!startPlaceId && stopIds.includes(startPlaceId);
    const rest = startIsStop ? stopIds.filter((id) => id !== startPlaceId) : stopIds;
    const pts = rest.map((id) => placesById.get(id));
    if (pts.some((p) => !p)) return stopIds;
    const start = startPlaceId ? placesById.get(startPlaceId) : undefined;
    const ordered = orderStops(pts as Place[], start).map((i) => rest[i]);
    return startIsStop ? [startPlaceId!, ...ordered] : ordered;
  };

  // Visit writes are queued per place so they reach storage in order. While a place has
  // writes in flight, `committed` holds the last value known to be stored; a failed write
  // rolls back to it, but only if it is still the latest write for that place (`seq`).
  const queues = new Map<string, Promise<boolean>>();
  const committed = new Map<string, Visit | undefined>();
  const seq = new Map<string, number>();

  const putInMemory = (id: string, value: Visit | undefined) =>
    set((s) => {
      const visits = { ...s.visits };
      if (value) visits[id] = value; else delete visits[id];
      return { visits };
    });

  /** Applies `next` (undefined removes the visit) in memory and saves it; false if saving failed. */
  const writeVisit = (id: string, next: Visit | undefined): Promise<boolean> => {
    const before = get().visits[id];
    const n = (seq.get(id) ?? 0) + 1;
    seq.set(id, n);
    putInMemory(id, next);
    if (!get().storageOk) return Promise.resolve(true);
    if (!queues.has(id)) committed.set(id, before);
    const run: Promise<boolean> = (queues.get(id) ?? Promise.resolve(true)).then(async () => {
      try {
        if (next) await putVisit(next); else await deleteVisit(id);
        committed.set(id, next);
        return true;
      } catch {
        if (seq.get(id) === n) putInMemory(id, committed.get(id)); // no later write owns the value
        get().showToast('storageError', 'error');
        return false;
      } finally {
        if (queues.get(id) === run) {
          queues.delete(id);
          committed.delete(id);
        }
      }
    });
    queues.set(id, run);
    return run;
  };

  /** Deletes a stored photo unless the visit (as it is now in memory) still shows it. */
  const dropPhotoIfUnused = async (id: string, photoId: string) => {
    if (get().visits[id]?.photoIds.includes(photoId)) return;
    await deletePhoto(photoId).catch(() => undefined);
  };

  async function load() {
    set({ status: 'loading' });
    try {
      const [places, areas] = await Promise.all([loadPlaces(), loadAreas()]);
      set({ places, placesById: new Map(places.map((p) => [p.id, p])), ...areaState(areas) });
    } catch (e) {
      console.error(e);
      set({ status: 'error' });
      return;
    }
    try {
      const [visits, trip, settings] = await Promise.all([
        getAllVisits(),
        getMeta<TripState>('trip'),
        getMeta<Settings>('settings'),
      ]);
      set({
        visits: Object.fromEntries(visits.map((v) => [v.placeId, v])),
        trip: pruneTrip(trip, get().placesById),
        settings: { ...defaultSettings(), ...settings },
        storageOk: true,
      });
    } catch (e) {
      if (!(e instanceof StorageUnavailableError)) console.error(e);
      set({ storageOk: false });
    }
    set({ status: 'ready' });
  }
  let loading: Promise<void> | null = null;

  return {
    status: 'loading',
    places: [], placesById: new Map(),
    areas: null, areasById: new Map(),
    visits: {}, trip: EMPTY_TRIP, settings: defaultSettings(), dataVersion: 0,
    selectedId: null, areaId: null, query: '', picking: false, welcomeOpen: false,
    toast: null,
    storageOk: true,

    init() {
      // StrictMode runs effects twice: share the running load instead of starting a second one.
      loading ??= load().finally(() => { loading = null; });
      return loading;
    },

    async reloadFromStorage() {
      const [visits, trip, settings] = await Promise.all([
        getAllVisits(), getMeta<TripState>('trip'), getMeta<Settings>('settings'),
      ]);
      set((s) => ({
        visits: Object.fromEntries(visits.map((v) => [v.placeId, v])),
        trip: trip ? pruneTrip(trip, s.placesById) : s.trip,
        dataVersion: s.dataVersion + 1,
      }));
      if (settings) get().setSettings(settings); // applies the Kosovo rules too
    },

    select: (id) => set({ selectedId: id }),
    setQuery: (query) => set({ query }),
    setArea: (areaId) => set({ areaId, picking: false }),
    setPicking: (picking) => set({ picking }),
    pickAreaAt(lat, lon, zoom) {
      const { areas, settings, setArea } = get();
      const hit = areas ? areaAt(areas, lat, lon, zoom, settings.kosovoShown) : null;
      if (hit) setArea(hit.id);
    },
    setWelcomeOpen: (welcomeOpen) => set({ welcomeOpen }),
    setSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      if (patch.kosovoShown === false) {
        // nothing Kosovo-related may stay selected while Kosovo is hidden
        const { selectedId, placesById } = get();
        if (selectArea(get())?.properties.inKosovo) set({ areaId: null });
        if (selectedId && placesById.get(selectedId)?.inKosovo) set({ selectedId: null });
      }
      persistMeta('settings', settings);
    },

    async markVisited(id) {
      if (get().visits[id]) return;
      if (!persistenceRequested) {
        persistenceRequested = true;
        void requestPersistence();
      }
      await writeVisit(id, { placeId: id, date: todayLocal(), note: '', photoIds: [] });
    },

    async unmarkVisited(id) {
      if (!get().visits[id]) return;
      await writeVisit(id, undefined);
    },

    async updateVisit(id, patch) {
      const prev = get().visits[id];
      if (!prev) return;
      await writeVisit(id, { ...prev, ...patch });
    },

    async addPhoto(id, file) {
      const full = (v: Visit | undefined) => !!v && v.photoIds.length >= MAX_PHOTOS_PER_VISIT;
      if (!get().visits[id]) return;
      if (full(get().visits[id])) {
        get().showToast('tooManyPhotos', 'info');
        return;
      }
      const photoId = crypto.randomUUID();
      try {
        const blob = await resizeImage(file);
        await putPhoto({ id: photoId, placeId: id, blob, createdAt: new Date().toISOString() });
      } catch {
        get().showToast('storageError', 'error');
        return;
      }
      // The visit may have changed while the photo was being stored: build on the current one.
      const cur = get().visits[id];
      const dropPhoto = () => deletePhoto(photoId).catch(() => undefined);
      if (!cur) {
        await dropPhoto(); // unmarked meanwhile: do not bring the visit back
        return;
      }
      if (full(cur)) {
        await dropPhoto(); // another pick filled the visit meanwhile
        get().showToast('tooManyPhotos', 'info');
        return;
      }
      await writeVisit(id, { ...cur, photoIds: [...cur.photoIds, photoId] });
      await dropPhotoIfUnused(id, photoId); // the write failed and nothing later kept the photo
    },

    async removePhoto(id, photoId) {
      const prev = get().visits[id];
      if (!prev) return;
      await writeVisit(id, { ...prev, photoIds: prev.photoIds.filter((p) => p !== photoId) });
      await dropPhotoIfUnused(id, photoId); // kept if a failed write rolled the photo back
    },

    addToTrip(id) {
      const { trip, placesById } = get();
      if (trip.stopIds.includes(id)) return;
      if (trip.stopIds.filter((s) => placesById.has(s)).length >= MAX_TRIP_STOPS) {
        get().showToast('tripFull', 'info');
        return;
      }
      setTrip({ ...trip, stopIds: reorder([...trip.stopIds, id], trip.startPlaceId) });
    },
    removeFromTrip(id) {
      const { trip } = get();
      setTrip({ ...trip, stopIds: trip.stopIds.filter((s) => s !== id) });
    },
    moveTripStop(id, dir) {
      const { trip } = get();
      const i = trip.stopIds.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= trip.stopIds.length) return;
      const stopIds = [...trip.stopIds];
      [stopIds[i], stopIds[j]] = [stopIds[j], stopIds[i]];
      setTrip({ ...trip, stopIds });
    },
    setTripStart(placeId) {
      setTrip({ ...get().trip, startPlaceId: placeId });
    },

    optimiseTrip() {
      const { trip } = get();
      setTrip({ ...trip, stopIds: reorder(trip.stopIds, trip.startPlaceId) });
    },

    showToast: (key, kind = 'info') => set({ toast: { key, kind } }),
  };
});
