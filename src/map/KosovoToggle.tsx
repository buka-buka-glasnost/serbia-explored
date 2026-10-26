import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';

/** The control's contents; usable without a map. */
export function KosovoToggleView() {
  const lang = useApp((s) => s.settings.lang);
  const shown = useApp((s) => s.settings.kosovoShown);
  const setSettings = useApp((s) => s.setSettings);
  const [open, setOpen] = useState(false);
  return (
    <div className="kosovo-toggle">
      <label>
        <input
          type="checkbox"
          checked={shown}
          aria-describedby="kosovo-note"
          onChange={(e) => setSettings({ kosovoShown: e.target.checked })}
        />{' '}
        {t('showKosovo', lang)}
      </label>
      <button
        type="button"
        className="kosovo-info"
        aria-label="Info"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⓘ
      </button>
      <div id="kosovo-note" role="tooltip" className={open ? 'kosovo-note open' : 'kosovo-note'}>
        {t('kosovoNote', lang)}
      </div>
    </div>
  );
}

/** Leaflet top-right control hosting the React toggle via a portal. */
export function KosovoToggle() {
  const map = useMap();
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const control = new L.Control({ position: 'topright' });
    control.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar kosovo-control');
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

  return container ? createPortal(<KosovoToggleView />, container) : null;
}
