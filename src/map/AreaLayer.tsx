import { useEffect, useMemo } from 'react';
import { GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { booleanPointInPolygon, point } from '@turf/turf';
import { useApp } from '../state/store';

const MUNICIPALITY_ZOOM = 9;

export function AreaLayer() {
  const map = useMap();
  const areas = useApp((s) => s.areas);
  const areaId = useApp((s) => s.areaId);
  const picking = useApp((s) => s.picking);
  const setArea = useApp((s) => s.setArea);
  const area = useMemo(
    () => (areaId ? areas?.features.find((f) => f.properties.id === areaId) ?? null : null),
    [areas, areaId],
  );

  useMapEvents({
    click(e) {
      if (!picking || !areas) return;
      const level = map.getZoom() >= MUNICIPALITY_ZOOM ? 'municipality' : 'district';
      const pt = point([e.latlng.lng, e.latlng.lat]);
      const hit = areas.features.find((f) => f.properties.level === level && booleanPointInPolygon(pt, f));
      if (hit) setArea(hit.properties.id);
    },
  });

  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = picking ? 'crosshair' : '';
    return () => { el.style.cursor = ''; };
  }, [map, picking]);

  useEffect(() => {
    if (!area) return;
    const bounds = L.geoJSON(area).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, area]);

  if (!area) return null;
  return (
    <GeoJSON
      key={areaId}
      data={area}
      interactive={false}
      style={{ color: '#222', weight: 2, fill: false }}
    />
  );
}
