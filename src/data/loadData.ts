import type { AreaFC, Place, PlacesFile } from '../shared/types';

async function fetchJson<T>(file: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}data/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function loadPlaces(): Promise<Place[]> {
  return (await fetchJson<PlacesFile>('places.json')).places;
}

export function loadAreas(): Promise<AreaFC> {
  return fetchJson<AreaFC>('areas.geojson');
}

export function loadKosovoOutline(): Promise<GeoJSON.Feature> {
  return fetchJson<GeoJSON.Feature>('kosovo.geojson');
}
