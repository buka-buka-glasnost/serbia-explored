import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useMap } from 'react-leaflet';
import { useApp } from '../state/store';
import { filterPlaces, splitByArea } from '../logic/filters';
import { placeName } from '../i18n/i18n';
import { markerStyle } from './markerStyle';
import type { AreaProps } from '../shared/types';

export { markerStyle } from './markerStyle';

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
    const group = L.markerClusterGroup({ disableClusteringAtZoom: 10, showCoverageOnHover: false });
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
    let active: Set<string> | null = null;
    if (area) {
      const { inside, nearby } = splitByArea(
        filtered,
        area as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProps>,
      );
      active = new Set([...inside, ...nearby].map((p) => p.id));
    }
    const markers = filtered.map((p) => {
      const dim = active !== null && !active.has(p.id);
      const m = L.circleMarker([p.lat, p.lon], {
        ...markerStyle(p, !!visits[p.id], trip.stopIds.includes(p.id)),
        fillOpacity: dim ? 0.25 : 0.9,
        opacity: dim ? 0.25 : 1,
      });
      m.bindTooltip(placeName(p, settings.lang));
      m.on('click', () => select(p.id));
      return m;
    });
    group.addLayers(markers);
  }, [places, visits, trip, settings, query, select, map, areas, areaId]);

  return null;
}
