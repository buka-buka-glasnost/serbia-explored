import { useEffect, useMemo, useState } from 'react';
import { GeoJSON, Pane } from 'react-leaflet';
import { useApp } from '../state/store';
import { loadKosovoOutline, loadOutlines } from '../data/loadData';
import { worldMask } from './worldMask';

type Outlines = Awaited<ReturnType<typeof loadOutlines>>;
interface Decor { outlines: Outlines | null; kosovo: GeoJSON.Feature | null }

const valueOf = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);

/** Both shapes are decoration: loaded together, and a failure of either leaves the map working. */
async function loadDecor(): Promise<Decor> {
  const [outlines, kosovo] = await Promise.allSettled([loadOutlines(), loadKosovoOutline()]);
  return { outlines: valueOf(outlines), kosovo: valueOf(kosovo) };
}

/**
 * Shades everything outside Serbia. With Kosovo shown, Kosovo is left clear and
 * gets a dashed border (its status is disputed); with Kosovo hidden, it is shaded too.
 */
export function KosovoLayer() {
  const shown = useApp((s) => s.settings.kosovoShown);
  const [decor, setDecor] = useState<Decor>({ outlines: null, kosovo: null });

  useEffect(() => {
    let cancelled = false;
    void loadDecor().then((d) => { if (!cancelled) setDecor(d); });
    return () => { cancelled = true; };
  }, []);

  const mask = useMemo(() => {
    const id = shown ? 'serbia-with-kosovo' : 'serbia';
    const shape = decor.outlines?.features.find((f) => f.properties.id === id);
    return shape ? worldMask(shape.geometry) : null;
  }, [decor.outlines, shown]);

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
      {decor.kosovo && shown && (
        <GeoJSON
          data={decor.kosovo}
          interactive={false}
          style={{ fill: false, color: '#8a6fa5', weight: 2, dashArray: '6 4' }}
        />
      )}
    </>
  );
}
