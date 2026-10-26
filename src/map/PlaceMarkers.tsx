import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { useMap } from 'react-leaflet';
import { useApp } from '../state/store';
import { useVisiblePlaces } from '../state/visiblePlaces';
import { areaOpacity } from '../logic/areas';
import { MarkerSync, type MarkerState } from './markerSync';

export { markerStyle } from './markerStyle';

/** Neutral clusters: size shows the count, colour is left to tiers and visit state. */
function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const n = cluster.getChildCount();
  const size = n < 10 ? 30 : n < 100 ? 36 : 44;
  return L.divIcon({ html: String(n), className: 'cluster', iconSize: [size, size] });
}

export function PlaceMarkers() {
  const map = useMap();
  const visits = useApp((s) => s.visits);
  const trip = useApp((s) => s.trip);
  const selectedId = useApp((s) => s.selectedId);
  const lang = useApp((s) => s.settings.lang);
  const { filtered, split } = useVisiblePlaces();
  const syncRef = useRef<MarkerSync | null>(null);

  useEffect(() => {
    const group = L.markerClusterGroup({
      disableClusteringAtZoom: 10,
      showCoverageOnHover: false,
      iconCreateFunction: clusterIcon,
    });
    map.addLayer(group);
    syncRef.current = new MarkerSync(group, useApp.getState().settings.lang, (p) => {
      const s = useApp.getState();
      // while picking an area, a marker click picks the area under it instead of the place
      if (s.picking) s.pickAreaAt(p.lat, p.lon, map.getZoom());
      else s.select(p.id);
    });
    return () => {
      map.removeLayer(group);
      syncRef.current = null;
    };
  }, [map]);

  const opacities = useMemo(() => areaOpacity(filtered, split), [filtered, split]);
  const state = useMemo((): MarkerState => {
    const tripIds = new Set(trip.stopIds);
    return {
      visited: (id) => !!visits[id],
      inTrip: (id) => tripIds.has(id),
      selectedId,
      opacity: (id) => opacities?.get(id) ?? 1,
    };
  }, [visits, trip, selectedId, opacities]);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Rebuild the visible set only when it changes...
  useEffect(() => {
    syncRef.current?.setVisible(filtered, stateRef.current);
  }, [filtered, opacities]);
  // ...and otherwise only restyle or relabel.
  useEffect(() => {
    syncRef.current?.restyle(state);
  }, [state]);
  useEffect(() => {
    syncRef.current?.setLang(lang);
  }, [lang]);

  return null;
}
