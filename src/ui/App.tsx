import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { MapView } from '../map/MapView';
import { SidePanel, type PanelTab, type SheetOptions } from './SidePanel';
import { PlaceCard } from './PlaceCard';
import { ProgressSummary } from './ProgressSummary';
import { Toast } from './Toast';
import { useIsNarrow } from './useIsNarrow';
import { usePresence } from './usePresence';
import { WelcomeDialog } from './WelcomeDialog';
import { isWelcomeDismissed } from './welcomePrefs';
import './app.css';

/** Focus without scrolling; ignores elements that are gone. */
const focusQuietly = (el: HTMLElement | null | undefined) => {
  if (el?.isConnected) el.focus({ preventScroll: true });
};

export function App() {
  const status = useApp((s) => s.status);
  const lang = useApp((s) => s.settings.lang);
  const selectedId = useApp((s) => s.selectedId);
  const selected = useApp((s) => (s.selectedId ? s.placesById.get(s.selectedId) : undefined));
  const picking = useApp((s) => s.picking);
  const setPicking = useApp((s) => s.setPicking);
  const query = useApp((s) => s.query);
  // stops of places no longer in the data do not count
  const tripCount = useApp((s) => s.trip.stopIds.filter((id) => s.placesById.has(id)).length);
  const narrow = useIsNarrow();
  /** The phone sheet (list, areas and trip), null while closed. */
  const [sheet, setSheet] = useState<SheetOptions | null>(null);
  const drawerOpen = sheet !== null;
  const drawerShown = narrow && drawerOpen;
  const drawer = usePresence(drawerShown ? sheet : null, 200);
  const card = usePresence(selected, 200);

  const mapArea = useRef<HTMLElement>(null);
  const topBar = useRef<HTMLDivElement>(null);
  const searchLauncher = useRef<HTMLButtonElement>(null);
  const tripLauncher = useRef<HTMLButtonElement>(null);
  /** The top-bar button the sheet was opened from: focus goes back to it on close. */
  const sheetOpener = useRef<HTMLButtonElement | null>(null);
  const cancelPick = useRef<HTMLButtonElement>(null);
  const cardHeading = useRef<HTMLHeadingElement>(null);
  /** The list row the card was opened from (null: opened from the map). */
  const opener = useRef<HTMLElement | null>(null);
  /** True between a list choice and the selection it causes. */
  const listChoice = useRef(false);
  /** Bumped on a list choice: focus the card heading once it is rendered and reachable. */
  const [headingFocus, setHeadingFocus] = useState(0);
  /** Set when the sheet is closed by the user, so focus goes back to the button that opened it. */
  const focusListOnClose = useRef(false);

  useEffect(() => {
    document.title = t('appTitle', lang);
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    void useApp.getState().init();
  }, []);
  // First visit (or until "do not show again" is ticked): introduce the app once the map is ready.
  useEffect(() => {
    if (status === 'ready' && !isWelcomeDismissed()) useApp.getState().setWelcomeOpen(true);
  }, [status]);
  // Selecting a place (from the list or a marker) or starting to pick an area closes the drawer.
  useEffect(() => {
    if (selectedId) setSheet(null);
  }, [selectedId]);
  useEffect(() => {
    if (picking) setSheet(null);
  }, [picking]);
  // Once the drawer is gone (the top bar is no longer inert), Cancel takes focus.
  useEffect(() => {
    if (picking && !drawerShown) focusQuietly(cancelPick.current);
  }, [picking, drawerShown]);
  useEffect(() => {
    if (!narrow) setSheet(null);
  }, [narrow]);

  const closeDrawer = () => {
    if (!drawerOpen) return; // already closed (e.g. a second Escape): nothing to return focus from
    focusListOnClose.current = true;
    setSheet(null);
  };
  useEffect(() => {
    if (drawerOpen) focusListOnClose.current = false; // a fresh open starts clean
    if (drawerOpen || !focusListOnClose.current) return;
    focusListOnClose.current = false;
    focusQuietly(sheetOpener.current);
  }, [drawerOpen]);

  /** Opens the phone sheet; its search field grows out of the top bar's, so measure where that one ends. */
  const openSheet = (tab: PanelTab, focus: SheetOptions['focus'], from: HTMLButtonElement | null) => {
    sheetOpener.current = from;
    const bar = topBar.current;
    const field = searchLauncher.current;
    let fromRight = 0;
    if (bar && field) {
      const inner = bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight || '0');
      fromRight = Math.max(0, inner - field.getBoundingClientRect().right);
    }
    setSheet({ tab, focus, fromRight });
  };

  // Card focus: opened from the list, focus its heading; closed, return focus to the
  // row it came from (or the map) unless the user has already moved focus elsewhere.
  useEffect(() => {
    if (selectedId) {
      if (!listChoice.current) opener.current = null; // chosen on the map
      return;
    }
    const active = document.activeElement;
    const focusLost = !active || active === document.body || !!active.closest('.place-card');
    if (focusLost) {
      const row = opener.current;
      focusQuietly(row?.isConnected ? row : mapArea.current?.querySelector<HTMLElement>('.leaflet-container'));
    }
    opener.current = null;
  }, [selectedId]);
  useEffect(() => {
    if (!headingFocus) return;
    listChoice.current = false;
    focusQuietly(cardHeading.current);
  }, [headingFocus]);

  // Escape: cancel picking, else close the drawer, else close the card. The welcome
  // dialog handles its own Escape; controls that use Escape themselves call preventDefault.
  const escapeState = useRef({ drawerShown, closeDrawer });
  escapeState.current = { drawerShown, closeDrawer };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const s = useApp.getState();
      if (s.welcomeOpen) return;
      if (s.picking) s.setPicking(false);
      else if (escapeState.current.drawerShown) escapeState.current.closeDrawer();
      else if (s.selectedId) s.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** A list row was chosen: remember it for focus, and close the drawer on phones. */
  const onPlaceChosen = (row: HTMLElement) => {
    opener.current = row;
    listChoice.current = true;
    setHeadingFocus((n) => n + 1);
    setSheet(null);
  };

  if (status === 'loading') return <div className="fullscreen-msg">…</div>;
  if (status === 'error') {
    return (
      <div className="fullscreen-msg" role="alert">
        {t('loadError', lang)}
        <button type="button" className="btn" onClick={() => void useApp.getState().init()}>{t('retry', lang)}</button>
      </div>
    );
  }
  return (
    <div className="app">
      {!narrow && <SidePanel onPlaceChosen={onPlaceChosen} />}
      {narrow && drawer.shown && (
        <SidePanel sheet={drawer.shown} onClose={closeDrawer} onPlaceChosen={onPlaceChosen} closing={drawer.closing} />
      )}
      {/* behind the open sheet, the map and top bar are out of reach */}
      <main className="map-area" ref={mapArea} inert={drawerShown || undefined}>
        {narrow && (
          <div className="top-bar" ref={topBar}>
            {picking ? (
              <div className="top-bar-pill picking">
                <p className="top-bar-hint" role="status">{t('pickOnMapHintTouch', lang)}</p>
                <button ref={cancelPick} type="button" className="btn" onClick={() => setPicking(false)}>
                  {t('cancel', lang)}
                </button>
              </div>
            ) : (
              <>
                {/* Looks like the search field it turns into: tapping it grows it into the full list. */}
                <button
                  ref={searchLauncher}
                  type="button"
                  className="top-bar-pill search-launcher"
                  aria-label={t('searchPlaceholder', lang)}
                  onClick={() => openSheet('places', 'search', searchLauncher.current)}
                >
                  <svg className="launcher-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
                    <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                  <span className={query ? 'launcher-query' : 'launcher-placeholder'} aria-hidden="true">
                    {query || t('searchPlaceholder', lang)}
                  </span>
                </button>
                <button
                  ref={tripLauncher}
                  type="button"
                  className="top-bar-chip trip-launcher"
                  aria-label={tripCount > 0 ? `${t('tripTab', lang)}: ${tripCount}` : t('tripTab', lang)}
                  onClick={() => openSheet('trip', 'back', tripLauncher.current)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 19.5c0-5 12-3 12-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" />
                    <circle cx="6" cy="19.5" r="2.4" fill="currentColor" />
                    <path d="M18 2.5a3.6 3.6 0 0 0-3.6 3.6c0 2.6 3.6 6 3.6 6s3.6-3.4 3.6-6A3.6 3.6 0 0 0 18 2.5z" fill="currentColor" />
                    <circle cx="18" cy="6.1" r="1.3" fill="var(--surface)" />
                  </svg>
                  <span aria-hidden="true">{t('tripTab', lang)}</span>
                  {tripCount > 0 && <span className="badge-count" aria-hidden="true">{tripCount}</span>}
                </button>
                <ProgressSummary compact />
              </>
            )}
          </div>
        )}
        <MapView />
        {card.shown && <PlaceCard place={card.shown} closing={card.closing} headingRef={cardHeading} />}
      </main>
      <WelcomeDialog />
      <Toast />
    </div>
  );
}
