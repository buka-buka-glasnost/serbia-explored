import { useEffect } from 'react';
import { GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { selectArea, useApp } from '../state/store';

export function AreaLayer() {
  const map = useMap();
  const area = useApp(selectArea);
  const picking = useApp((s) => s.picking);

  useMapEvents({
    click(e) {
      if (picking) useApp.getState().pickAreaAt(e.latlng.lat, e.latlng.lng, map.getZoom());
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
      key={area.properties.id}
      data={area}
      interactive={false}
      style={{ color: '#222', weight: 2, fill: false }}
    />
  );
}
