import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { MapView } from '../map/MapView';
import { SidePanel } from './SidePanel';
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
  const narrow = useIsNarrow();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerShown = narrow && drawerOpen;
  const drawer = usePresence(drawerShown ? true : null, 200);
  const card = usePresence(selected, 200);

  const mapArea = useRef<HTMLElement>(null);
  const listButton = useRef<HTMLButtonElement>(null);
  const cancelPick = useRef<HTMLButtonElement>(null);
  const cardHeading = useRef<HTMLHeadingElement>(null);
  /** The list row the card was opened from (null: opened from the map). */
  const opener = useRef<HTMLElement | null>(null);
  /** True between a list choice and the selection it causes. */
  const listChoice = useRef(false);
  /** Bumped on a list choice: focus the card heading once it is rendered and reachable. */
  const [headingFocus, setHeadingFocus] = useState(0);
  /** Set when the drawer is closed by the user, so focus goes back to the List button. */
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
    if (selectedId) setDrawerOpen(false);
  }, [selectedId]);
  useEffect(() => {
    if (picking) setDrawerOpen(false);
  }, [picking]);
  // Once the drawer is gone (the top bar is no longer inert), Cancel takes focus.
  useEffect(() => {
    if (picking && !drawerShown) focusQuietly(cancelPick.current);
  }, [picking, drawerShown]);
  useEffect(() => {
    if (!narrow) setDrawerOpen(false);
  }, [narrow]);

  const closeDrawer = () => {
    focusListOnClose.current = true;
    setDrawerOpen(false);
  };
  useEffect(() => {
    if (drawerOpen || !focusListOnClose.current) return;
    focusListOnClose.current = false;
    focusQuietly(listButton.current);
  }, [drawerOpen]);

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
    setDrawerOpen(false);
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
        <>
          <div
            className="drawer-backdrop"
            aria-hidden="true"
            data-state={drawer.closing ? 'closing' : 'open'}
            onClick={closeDrawer}
          />
          <SidePanel onClose={closeDrawer} onPlaceChosen={onPlaceChosen} closing={drawer.closing} />
        </>
      )}
      {/* behind the open drawer, the map and top bar are out of reach */}
      <main className="map-area" ref={mapArea} inert={drawerShown || undefined}>
        {narrow && (
          <div className="top-bar">
            {picking ? (
              <>
                <p className="top-bar-hint" role="status">{t('pickOnMapHintTouch', lang)}</p>
                <button ref={cancelPick} type="button" className="btn" onClick={() => setPicking(false)}>
                  {t('cancel', lang)}
                </button>
              </>
            ) : (
              <>
                <ProgressSummary compact />
                <button
                  ref={listButton}
                  type="button"
                  className="btn btn-primary list-button"
                  onClick={() => setDrawerOpen(true)}
                >
                  {t('listButton', lang)}
                </button>
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
