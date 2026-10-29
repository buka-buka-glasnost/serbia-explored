import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { LanguageSwitch } from './LanguageSwitch';
import { ProgressSummary } from './ProgressSummary';
import { AreaPicker } from './AreaPicker';
import { Filters, SearchField } from './Filters';
import { PlaceList } from './PlaceList';
import { TripPanel } from './TripPanel';
import { BackupControls } from './BackupControls';

export type PanelTab = 'places' | 'trip';

/** How the phone sheet was opened: which tab it shows, and where the top bar's search field ended. */
export interface SheetOptions {
  tab: PanelTab;
  /** Focus the search box (opened from the search field) or the back button (opened from Trip). */
  focus: 'search' | 'back';
  /** Gap between the top bar's search field and the right edge: the sheet's field grows from there. */
  fromRight: number;
}

/**
 * The desktop side panel, or on phones (`sheet` and `onClose` given) a full-screen
 * sheet whose top row is the search field the top bar showed, grown to full width.
 * `onPlaceChosen` gets the list row a place was chosen from.
 */
export function SidePanel({ sheet, onClose, onPlaceChosen, closing = false }: {
  sheet?: SheetOptions; onClose?: () => void; onPlaceChosen?: (row: HTMLElement) => void; closing?: boolean;
}) {
  const lang = useApp((s) => s.settings.lang);
  // stops of places no longer in the data do not count
  const tripCount = useApp((s) => s.trip.stopIds.filter((id) => s.placesById.has(id)).length);
  const [tab, setTab] = useState<PanelTab>(sheet?.tab ?? 'places');
  const backButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  // An opened sheet takes focus on its search box or its back button.
  useEffect(() => {
    if (!sheet || closing) return;
    (sheet.focus === 'search' ? searchInput : backButton).current?.focus({ preventScroll: true });
  }, [closing]);

  const header = (
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
    </header>
  );
  const content = (
    <>
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
          <Filters search={!sheet} />
          <PlaceList onSelect={onPlaceChosen} />
        </>
      ) : (
        <TripPanel />
      )}
      <BackupControls />
    </>
  );

  if (!sheet) {
    return (
      <aside className="side-panel">
        {header}
        {content}
      </aside>
    );
  }
  return (
    <aside
      className="side-panel sheet"
      data-state={closing ? 'closing' : 'open'}
      aria-hidden={closing || undefined}
      inert={closing || undefined}
      style={{ '--from-right': `${sheet.fromRight}px` } as CSSProperties}
    >
      <div className="sheet-bg" aria-hidden="true" />
      <div className="sheet-search">
        <div className="sheet-field">
          <button ref={backButton} type="button" className="sheet-back" aria-label={t('backToMap', lang)} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12H5.5M11.5 5.5 5 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* typing always shows the results, even when the sheet was opened on the Trip tab */}
          <SearchField inputRef={searchInput} onType={() => setTab('places')} />
        </div>
      </div>
      <div className="sheet-body">
        {header}
        {content}
      </div>
    </aside>
  );
}
