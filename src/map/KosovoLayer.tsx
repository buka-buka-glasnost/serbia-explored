import { useEffect, useMemo, useState } from 'react';
import { GeoJSON, Pane } from 'react-leaflet';
import { useApp } from '../state/store';
import { loadOutlines } from '../data/loadData';
import { worldMask } from './worldMask';

type Outlines = Awaited<ReturnType<typeof loadOutlines>>;

/**
 * Shades everything outside Serbia. With Kosovo shown, Kosovo is left clear and
 * gets a dashed border (its status is disputed); with Kosovo hidden, it is shaded too.
 */
export function KosovoLayer() {
  const kosovo = useApp((s) => s.kosovo);
  const shown = useApp((s) => s.settings.kosovoShown);
  const [outlines, setOutlines] = useState<Outlines | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadOutlines()
      .then((o) => { if (!cancelled) setOutlines(o); })
      .catch(() => undefined); // shading is decoration; the map works without it
    return () => { cancelled = true; };
  }, []);

  const mask = useMemo(() => {
    const id = shown ? 'serbia-with-kosovo' : 'serbia';
    const shape = outlines?.features.find((f) => f.properties.id === id);
    return shape ? worldMask(shape.geometry) : null;
  }, [outlines, shown]);

  return (
    <>
      {mask && (
        <Pane name="outside-serbia" style={{ zIndex: 350 }}>
          <GeoJSON
            key={shown ? 'with' : 'without'}
            data={mask}
            interactive={false}
            style={{ stroke: false, fillColor: '#2b2620', fillOpacity: 0.28, fillRule: 'evenodd' }}
          />
        </Pane>
      )}
      {kosovo && shown && (
        <GeoJSON
          data={kosovo}
          interactive={false}
          style={{ fill: false, color: '#8a6fa5', weight: 2, dashArray: '6 4' }}
        />
      )}
    </>
  );
}
