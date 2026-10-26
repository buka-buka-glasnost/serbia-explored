import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';

export function InfoButtonView() {
  const lang = useApp((s) => s.settings.lang);
  const setWelcomeOpen = useApp((s) => s.setWelcomeOpen);
  return (
    <button
      type="button"
      className="info-button"
      aria-label={t('aboutApp', lang)}
      title={t('aboutApp', lang)}
      onClick={() => setWelcomeOpen(true)}
    >
      i
    </button>
  );
}

/** Always-visible "i" control (top left, under the zoom buttons) that reopens the welcome message. */
export function InfoButton() {
  const map = useMap();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const control = new L.Control({ position: 'topleft' });
    control.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar info-control');
      L.DomEvent.disableClickPropagation(div);
      setContainer(div);
      return div;
    };
    control.addTo(map);
    return () => {
      control.remove();
      setContainer(null);
    };
  }, [map]);
  return container ? createPortal(<InfoButtonView />, container) : null;
}
