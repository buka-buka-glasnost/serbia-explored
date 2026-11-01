import { useEffect } from 'react';
import { GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { selectArea, useApp } from '../state/store';
import { reducedMotion } from './motion';

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
    if (!bounds.isValid()) return;
    // a flight, because fitBounds cuts to anything far away or many zoom levels off
    if (reducedMotion()) map.fitBounds(bounds, { padding: [30, 30], animate: false });
    else map.flyToBounds(bounds, { padding: [30, 30], duration: 0.7, easeLinearity: 0.2 });
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
