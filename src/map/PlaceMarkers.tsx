import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { useMap } from 'react-leaflet';
import { useApp } from '../state/store';
import { filterPlaces } from '../logic/filters';
import { areaOpacity } from '../logic/areas';
import { placeName } from '../i18n/i18n';
import { markerStyle } from './markerStyle';
import type { AreaProps } from '../shared/types';

export { markerStyle } from './markerStyle';

/** Neutral clusters: size shows the count, colour is left to tiers and visit state. */
function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const n = cluster.getChildCount();
  const size = n < 10 ? 30 : n < 100 ? 36 : 44;
  return L.divIcon({ html: String(n), className: 'cluster', iconSize: [size, size] });
}

export function PlaceMarkers() {
  const map = useMap();
  const places = useApp((s) => s.places);
  const visits = useApp((s) => s.visits);
  const trip = useApp((s) => s.trip);
  const settings = useApp((s) => s.settings);
  const query = useApp((s) => s.query);
  const select = useApp((s) => s.select);
  const areas = useApp((s) => s.areas);
  const areaId = useApp((s) => s.areaId);
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const group = L.markerClusterGroup({
      disableClusteringAtZoom: 10,
      showCoverageOnHover: false,
      iconCreateFunction: clusterIcon,
    });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    const filtered = filterPlaces(places, settings, query);
    const area = areaId ? areas?.features.find((f) => f.properties.id === areaId) : undefined;
    const opacities = areaOpacity(
      filtered,
      area as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProps> | undefined,
    );
    const markers = filtered.map((p) => {
      const opacity = opacities?.get(p.id) ?? 1;
      const m = L.circleMarker([p.lat, p.lon], {
        ...markerStyle(p, !!visits[p.id], trip.stopIds.includes(p.id)),
        fillOpacity: 0.9 * opacity,
        opacity,
      });
      m.bindTooltip(placeName(p, settings.lang));
      m.on('click', () => select(p.id));
      return m;
    });
    group.addLayers(markers);
  }, [places, visits, trip, settings, query, select, map, areas, areaId]);

  return null;
}
