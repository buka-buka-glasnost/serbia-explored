import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';

const TIERS = [1, 2, 3, 4] as const;

export function LegendView() {
  const lang = useApp((s) => s.settings.lang);
  return (
    <details open>
      <summary>{t('legend', lang)}</summary>
      <ul>
        {TIERS.map((n) => (
          <li key={n}>
            <span className={`dot tier${n}`} aria-hidden="true" />
            {t(`tier${n}`, lang)}
          </li>
        ))}
        <li><span className="ring visited" aria-hidden="true" />{t('visitedCounter', lang)}</li>
        <li><span className="ring trip" aria-hidden="true" />{t('legendTrip', lang)}</li>
      </ul>
    </details>
  );
}

/** Bottom-left map legend (hidden on phones by CSS). */
export function Legend() {
  const map = useMap();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const control = new L.Control({ position: 'bottomleft' });
    control.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar legend');
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      setContainer(div);
      return div;
    };
    control.addTo(map);
    return () => {
      control.remove();
      setContainer(null);
    };
  }, [map]);
  return container ? createPortal(<LegendView />, container) : null;
}
