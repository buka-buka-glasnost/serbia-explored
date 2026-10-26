import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { MapControl } from './MapControl';

/** The control's contents; usable without a map. */
export function KosovoToggleView() {
  const lang = useApp((s) => s.settings.lang);
  const shown = useApp((s) => s.settings.kosovoShown);
  const setSettings = useApp((s) => s.setSettings);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); // handled: the app-wide Escape (close the card) skips it
      setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);
  return (
    <div className="kosovo-toggle" ref={root}>
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
        aria-label={t('kosovoInfo', lang)}
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

/** Leaflet top-right control hosting the toggle. */
export function KosovoToggle() {
  return (
    <MapControl position="topright" className="leaflet-bar kosovo-control">
      <KosovoToggleView />
    </MapControl>
  );
}
