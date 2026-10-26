import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../state/store';
import { TILES } from './tiles';
import { PlaceMarkers } from './PlaceMarkers';
import { KosovoLayer } from './KosovoLayer';
import { AreaLayer } from './AreaLayer';
import { KosovoToggle } from './KosovoToggle';

// Serbia bbox (including Kosovo): lat 41.8-46.2, lon 18.8-23.0, padded by 1 degree.
const MAX_BOUNDS = L.latLngBounds([40.8, 17.8], [47.2, 24.0]);

/** Fits the initial view to all places once the map has been laid out. */
function FitToPlaces() {
  const map = useMap();
  const places = useApp((s) => s.places);
  useEffect(() => {
    if (places.length === 0) return;
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lon] as [number, number])), { padding: [20, 20] });
  }, [map]);
  return null;
}

/** Flies to the selected place, zooming in to at least 12. */
function FlyToSelected() {
  const map = useMap();
  const selected = useApp((s) => (s.selectedId ? s.placesById.get(s.selectedId) : undefined));
  useEffect(() => {
    if (!selected) return;
    map.flyTo([selected.lat, selected.lon], Math.max(map.getZoom(), 12));
  }, [map, selected]);
  return null;
}

export function MapView() {
  return (
    <MapContainer className="map" center={[44.2, 20.9]} zoom={7} maxBounds={MAX_BOUNDS} minZoom={6}>
      <FitToPlaces />
      <FlyToSelected />
      <TileLayer url={TILES.url} attribution={TILES.attribution} maxZoom={TILES.maxZoom} />
      <KosovoLayer />
      <AreaLayer />
      <PlaceMarkers />
      <KosovoToggle />
    </MapContainer>
  );
}
