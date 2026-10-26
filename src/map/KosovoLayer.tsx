import { GeoJSON } from 'react-leaflet';
import { useApp } from '../state/store';

export function KosovoLayer() {
  const kosovo = useApp((s) => s.kosovo);
  const shown = useApp((s) => s.settings.kosovoShown);
  if (!kosovo || !shown) return null;
  return (
    <GeoJSON
      data={kosovo}
      interactive={false}
      style={{ fillColor: '#8a6fa5', fillOpacity: 0.18, color: '#8a6fa5', weight: 1.5, dashArray: '6 4' }}
    />
  );
}
