import { useMemo } from 'react';
import { filterPlaces, splitByArea, type AreaSplit } from '../logic/filters';
import type { Place, PlaceKind, Tier } from '../shared/types';
import { selectArea, useApp, type AreaFeature } from './store';

export interface VisiblePlaces {
  /** Places passing the filters and search, in data order. */
  filtered: Place[];
  /** With an area selected: the filtered places inside it and nearby; null otherwise. */
  split: AreaSplit | null;
}

type Inputs = [Place[], Tier[], PlaceKind[], boolean, string, AreaFeature | null];

let last: { inputs: Inputs; value: VisiblePlaces } | null = null;

/**
 * The visible places for these inputs. One cached result is shared by every caller
 * (the list and the markers), so the filter and the area split run once per change.
 */
export function visiblePlaces(...inputs: Inputs): VisiblePlaces {
  if (last && inputs.every((v, i) => v === last!.inputs[i])) return last.value;
  const [places, tiers, kinds, kosovoShown, query, area] = inputs;
  const filtered = filterPlaces(places, { tiers, kinds, kosovoShown }, query);
  const value = { filtered, split: area ? splitByArea(filtered, area) : null };
  last = { inputs, value };
  return value;
}

/** Visible places; changes only with places, filters, search and area (not visits, trip or language). */
export function useVisiblePlaces(): VisiblePlaces {
  const places = useApp((s) => s.places);
  const tiers = useApp((s) => s.settings.tiers);
  const kinds = useApp((s) => s.settings.kinds);
  const kosovoShown = useApp((s) => s.settings.kosovoShown);
  const query = useApp((s) => s.query);
  const area = useApp(selectArea);
  return useMemo(
    () => visiblePlaces(places, tiers, kinds, kosovoShown, query, area),
    [places, tiers, kinds, kosovoShown, query, area],
  );
}
