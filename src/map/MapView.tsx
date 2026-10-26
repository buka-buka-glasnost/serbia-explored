import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../state/store';
import { TILES } from './tiles';
import { PlaceMarkers } from './PlaceMarkers';
import { KosovoLayer } from './KosovoLayer';
import { AreaLayer } from './AreaLayer';
import { KosovoToggle } from './KosovoToggle';
import { Legend } from './Legend';
import { InfoButton } from './InfoButton';
import { canFit } from './canFit';
import { useIsNarrow } from '../ui/useIsNarrow';

// Serbia bbox (including Kosovo): lat 41.8-46.2, lon 18.8-23.0, padded by 1 degree.
const MAX_BOUNDS = L.latLngBounds([40.8, 17.8], [47.2, 24.0]);

/**
 * Fits the initial view to all places. Skips while the container has no size
 * (hidden pane, layout not settled) and retries once it gets one. Also
 * re-validates the map size when the layout switches between narrow and wide.
 */
function FitToPlaces() {
  const map = useMap();
  const places = useApp((s) => s.places);
  const narrow = useIsNarrow();
  const fitted = useRef(false);

  useEffect(() => {
    if (places.length === 0 || fitted.current) return;
    const tryFit = () => {
      map.invalidateSize();
      if (fitted.current || !canFit(map.getSize())) return;
      fitted.current = true;
      map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lon] as [number, number])), { padding: [20, 20] });
    };
    tryFit();
    if (fitted.current) return;
    map.on('resize', tryFit);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(tryFit);
    ro?.observe(map.getContainer());
    return () => {
      map.off('resize', tryFit);
      ro?.disconnect();
    };
  }, [map, places]);

  useEffect(() => {
    map.invalidateSize();
  }, [map, narrow]);
  return null;
}

const reducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Brings the selected place into view at zoom 12 or more: a pan when it is already
 * on screen at that zoom, a short flight otherwise, an instant jump with reduced motion.
 */
function FlyToSelected() {
  const map = useMap();
  const selected = useApp((s) => (s.selectedId ? s.placesById.get(s.selectedId) : undefined));
  const narrow = useIsNarrow();
  useEffect(() => {
    if (!selected) return;
    const zoom = Math.max(map.getZoom(), 12);
    const place = L.latLng(selected.lat, selected.lon);
    let target = place;
    if (narrow) {
      // The bottom sheet covers the lower part of the map: keep the place in the visible top part.
      const size = map.getSize();
      target = map.unproject(map.project(place, zoom).add([0, size.y * 0.25]), zoom);
    }
    if (reducedMotion()) map.setView(target, zoom, { animate: false });
    else if (zoom === map.getZoom() && map.getBounds().pad(-0.1).contains(place)) map.panTo(target, { duration: 0.35 });
    else map.flyTo(target, zoom, { duration: 0.6, easeLinearity: 0.2 });
  }, [map, selected]); // `narrow` is read at selection time only
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
      <Legend />
      <InfoButton />
    </MapContainer>
  );
}
