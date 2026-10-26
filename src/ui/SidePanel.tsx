import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { LanguageSwitch } from './LanguageSwitch';
import { ProgressSummary } from './ProgressSummary';
import { AreaPicker } from './AreaPicker';
import { Filters } from './Filters';
import { PlaceList } from './PlaceList';
import { TripPanel } from './TripPanel';
import { BackupControls } from './BackupControls';

/**
 * `onClose` is given in the phone layout, where the panel is a drawer.
 * `onPlaceChosen` gets the list row a place was chosen from.
 */
export function SidePanel({ onClose, onPlaceChosen, closing = false }: {
  onClose?: () => void; onPlaceChosen?: (row: HTMLElement) => void; closing?: boolean;
}) {
  const lang = useApp((s) => s.settings.lang);
  // stops of places no longer in the data do not count
  const tripCount = useApp((s) => s.trip.stopIds.filter((id) => s.placesById.has(id)).length);
  const [tab, setTab] = useState<'places' | 'trip'>('places');
  const closeButton = useRef<HTMLButtonElement>(null);
  // An opened drawer takes focus on its close button.
  useEffect(() => {
    if (onClose && !closing) closeButton.current?.focus({ preventScroll: true });
  }, [closing]);
  return (
    <aside
      className={onClose ? 'side-panel drawer' : 'side-panel'}
      data-state={closing ? 'closing' : 'open'}
      aria-hidden={closing || undefined}
      inert={closing || undefined}
    >
      <header className="panel-header">
        <h1>
          <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2.5c-4 0-7 3-7 6.9 0 5 7 12.1 7 12.1s7-7.1 7-12.1C19 5.5 16 2.5 12 2.5z"
              fill="currentColor"
            />
            <circle cx="12" cy="9.4" r="2.6" fill="#fffdf9" />
          </svg>
          {t('appTitle', lang)}
        </h1>
        <LanguageSwitch />
        {onClose && (
          <button ref={closeButton} type="button" className="drawer-close" aria-label={t('close', lang)} onClick={onClose}>
            ×
          </button>
        )}
      </header>
      <ProgressSummary />
      <div className="tabs" role="group">
        <button type="button" aria-pressed={tab === 'places'} onClick={() => setTab('places')}>
          {t('placesTab', lang)}
        </button>
        <button type="button" aria-pressed={tab === 'trip'} onClick={() => setTab('trip')}>
          {t('tripTab', lang)}
          {tripCount > 0 && <span className="badge-count">{tripCount}</span>}
        </button>
      </div>
      {tab === 'places' ? (
        <>
          <AreaPicker />
          <Filters />
          <PlaceList onSelect={onPlaceChosen} />
        </>
      ) : (
        <TripPanel />
      )}
      <BackupControls />
    </aside>
  );
}
