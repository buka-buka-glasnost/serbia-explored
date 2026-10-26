import type { Place } from '../src/shared/types';

export interface Overrides {
  places: Record<string, Partial<Omit<Place, 'id'>>>; // patch by id
  added: Place[]; // manual places (id "x-<slug>")
  removed: string[]; // ids to drop
  /** Display names for WHS composites (partOf) whose raw labels are missing. */
  partOfNames?: Record<string, { nameSr: string; nameEn?: string }>;
}

/** Patch, add and remove places. Unknown ids throw (they are almost always typos). */
export function applyOverrides(places: Place[], o: Overrides): Place[] {
  const ids = new Set(places.map((p) => p.id));
  for (const id of Object.keys(o.places)) {
    if (!ids.has(id)) throw new Error(`Override patches unknown place id: ${id}`);
  }
  for (const id of o.removed) {
    if (!ids.has(id)) throw new Error(`Override removes unknown place id: ${id}`);
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
      const next = { ...p, ...patch, id: p.id } as Place;
      // a hand-set access value is a fact, not an estimate
      if ('access' in patch && !('accessEstimated' in patch)) delete next.accessEstimated;
      return next;
    });
  return [...patched, ...o.added];
}
