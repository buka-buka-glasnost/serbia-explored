import { useEffect, useState } from 'react';
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

export function App() {
  const status = useApp((s) => s.status);
  const lang = useApp((s) => s.settings.lang);
  const selectedId = useApp((s) => s.selectedId);
  const selected = useApp((s) => (s.selectedId ? s.placesById.get(s.selectedId) : undefined));
  const narrow = useIsNarrow();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = usePresence(narrow && drawerOpen ? true : null, 200);
  const card = usePresence(selected, 200);
  useEffect(() => {
    document.title = t('appTitle', lang);
  }, [lang]);
  useEffect(() => {
    void useApp.getState().init();
  }, []);
  // First visit (or until "do not show again" is ticked): introduce the app once the map is ready.
  useEffect(() => {
    if (status === 'ready' && !isWelcomeDismissed()) useApp.getState().setWelcomeOpen(true);
  }, [status]);
  // Selecting a place (from the list or a marker) closes the drawer.
  useEffect(() => {
    if (selectedId) setDrawerOpen(false);
  }, [selectedId]);
  useEffect(() => {
    if (!narrow) setDrawerOpen(false);
  }, [narrow]);

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
      {!narrow && <SidePanel />}
      {narrow && drawer.shown && (
        <>
          <div
            className="drawer-backdrop"
            aria-hidden="true"
            data-state={drawer.closing ? 'closing' : 'open'}
            onClick={() => setDrawerOpen(false)}
          />
          <SidePanel onClose={() => setDrawerOpen(false)} closing={drawer.closing} />
        </>
      )}
      <main className="map-area">
        {narrow && (
          <div className="top-bar">
            <ProgressSummary compact />
            <button type="button" className="btn btn-primary list-button" onClick={() => setDrawerOpen(true)}>
              {t('listButton', lang)}
            </button>
          </div>
        )}
        <MapView />
        {card.shown && <PlaceCard place={card.shown} closing={card.closing} />}
      </main>
      <WelcomeDialog />
      <Toast />
    </div>
  );
}
