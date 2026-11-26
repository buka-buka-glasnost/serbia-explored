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

  const border = useMemo(() => {
    const id = shown ? 'serbia-with-kosovo' : 'serbia';
    return decor.outlines?.features.find((f) => f.properties.id === id) ?? null;
  }, [decor.outlines, shown]);
  const mask = useMemo(() => (border ? worldMask(border.geometry) : null), [border]);

  return (
    <>
      {mask && (
        <Pane name="outside-serbia" style={{ zIndex: 350 }}>
          <GeoJSON
            key={shown ? 'with' : 'without'}
            data={mask}
            interactive={false}
            style={{ stroke: false, fillColor: '#2a2118', fillOpacity: 0.3, fillRule: 'evenodd' }}
          />
          {/* the border in the flag's colours: a red line with a blue core */}
          <GeoJSON key={`red-${shown}`} data={border!} interactive={false} style={{ fill: false, color: '#9b2f2a', weight: 4.5, opacity: 0.85 }} />
          <GeoJSON key={`blue-${shown}`} data={border!} interactive={false} style={{ fill: false, color: '#23395b', weight: 1.6 }} />
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
