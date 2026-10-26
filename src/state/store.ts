import { create } from 'zustand';
import type { AreaFC, Place } from '../shared/types';
import type { StringKey } from '../i18n/strings';
import { detectLang } from '../i18n/i18n';
import { DEFAULT_SETTINGS, type Settings } from '../logic/filters';
import { todayLocal } from '../logic/date';
import { loadAreas, loadKosovoOutline, loadPlaces } from '../data/loadData';
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
import { resizeImage } from '../storage/photos';

export interface AppState {
  status: 'loading' | 'ready' | 'error';
  places: Place[]; placesById: Map<string, Place>;
  areas: AreaFC | null; kosovo: GeoJSON.Feature | null;
  visits: Record<string, Visit>; trip: TripState; settings: Settings;
  selectedId: string | null; areaId: string | null; query: string;
  toast: { key: StringKey; kind: 'info' | 'error' } | null;
  storageOk: boolean;
  init(): Promise<void>;
  select(id: string | null): void;
  setQuery(q: string): void;
  setSettings(patch: Partial<Settings>): void;
  setArea(id: string | null): void;
  markVisited(id: string): Promise<void>;
  unmarkVisited(id: string): Promise<void>;
  updateVisit(id: string, patch: Partial<Pick<Visit, 'date' | 'note'>>): Promise<void>;
  addPhoto(id: string, file: File): Promise<void>;
  removePhoto(id: string, photoId: string): Promise<void>;
  addToTrip(id: string): void;
  removeFromTrip(id: string): void;
  moveTripStop(id: string, dir: -1 | 1): void;
  setTripStart(placeId: string | null): void;
  showToast(key: StringKey, kind?: 'info' | 'error'): void;
}

const defaultSettings = (): Settings => ({
  ...DEFAULT_SETTINGS,
  lang: detectLang(typeof navigator === 'undefined' ? undefined : navigator.language),
});

let persistenceRequested = false;

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

  /** Applies `next` in memory, saves it, and rolls back to the previous visit on failure. */
  const saveVisit = async (id: string, next: Visit): Promise<boolean> => {
    const prev = get().visits[id];
    set((s) => ({ visits: { ...s.visits, [id]: next } }));
    if (!get().storageOk) return true;
    try {
      await putVisit(next);
      return true;
    } catch {
      set((s) => {
        const visits = { ...s.visits };
        if (prev) visits[id] = prev; else delete visits[id];
        return { visits };
      });
      get().showToast('storageError', 'error');
      return false;
    }
  };

  return {
    status: 'loading',
    places: [], placesById: new Map(),
    areas: null, kosovo: null,
    visits: {}, trip: { stopIds: [], startPlaceId: null }, settings: defaultSettings(),
    selectedId: null, areaId: null, query: '',
    toast: null,
    storageOk: true,

    async init() {
      set({ status: 'loading' });
      try {
        const [places, areas, kosovo] = await Promise.all([loadPlaces(), loadAreas(), loadKosovoOutline()]);
        set({ places, placesById: new Map(places.map((p) => [p.id, p])), areas, kosovo });
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
          trip: trip ?? { stopIds: [], startPlaceId: null },
          settings: { ...defaultSettings(), ...settings },
          storageOk: true,
        });
      } catch (e) {
        if (!(e instanceof StorageUnavailableError)) console.error(e);
        set({ storageOk: false });
      }
      set({ status: 'ready' });
    },

    select: (id) => set({ selectedId: id }),
    setQuery: (query) => set({ query }),
    setArea: (areaId) => set({ areaId }),
    setSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      persistMeta('settings', settings);
    },

    async markVisited(id) {
      if (get().visits[id]) return;
      if (!persistenceRequested) {
        persistenceRequested = true;
        void requestPersistence();
      }
      await saveVisit(id, { placeId: id, date: todayLocal(), note: '', photoIds: [] });
    },

    async unmarkVisited(id) {
      const prev = get().visits[id];
      if (!prev) return;
      set((s) => {
        const visits = { ...s.visits };
        delete visits[id];
        return { visits };
      });
      if (!get().storageOk) return;
      try {
        await deleteVisit(id);
      } catch {
        set((s) => ({ visits: { ...s.visits, [id]: prev } }));
        get().showToast('storageError', 'error');
      }
    },

    async updateVisit(id, patch) {
      const prev = get().visits[id];
      if (!prev) return;
      await saveVisit(id, { ...prev, ...patch });
    },

    async addPhoto(id, file) {
      const prev = get().visits[id];
      if (!prev) return;
      const photoId = crypto.randomUUID();
      try {
        const blob = await resizeImage(file);
        await putPhoto({ id: photoId, placeId: id, blob, createdAt: new Date().toISOString() });
      } catch {
        get().showToast('storageError', 'error');
        return;
      }
      const ok = await saveVisit(id, { ...(get().visits[id] ?? prev), photoIds: [...(get().visits[id] ?? prev).photoIds, photoId] });
      if (!ok) await deletePhoto(photoId).catch(() => undefined);
    },

    async removePhoto(id, photoId) {
      const prev = get().visits[id];
      if (!prev) return;
      const ok = await saveVisit(id, { ...prev, photoIds: prev.photoIds.filter((p) => p !== photoId) });
      if (ok) await deletePhoto(photoId).catch(() => undefined);
    },

    addToTrip(id) {
      const { trip } = get();
      if (trip.stopIds.includes(id)) return;
      setTrip({ ...trip, stopIds: [...trip.stopIds, id] });
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

    showToast: (key, kind = 'info') => set({ toast: { key, kind } }),
  };
});
