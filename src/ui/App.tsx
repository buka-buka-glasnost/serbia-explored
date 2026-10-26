import { useEffect } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { MapView } from '../map/MapView';
import { LanguageSwitch } from './LanguageSwitch';
import { Toast } from './Toast';
import './app.css';

export function App() {
  const status = useApp((s) => s.status);
  const lang = useApp((s) => s.settings.lang);
  const storageOk = useApp((s) => s.storageOk);
  useEffect(() => {
    void useApp.getState().init();
  }, []);

  if (status === 'loading') return <div className="fullscreen-msg">…</div>;
  if (status === 'error') {
    return (
      <div className="fullscreen-msg" role="alert">
        Could not load the map data. Please reload the page.
        <button type="button" onClick={() => void useApp.getState().init()}>Retry</button>
      </div>
    );
  }
  return (
    <div className="app">
      <header className="app-header">
        <h1>{t('appTitle', lang)}</h1>
        <LanguageSwitch />
      </header>
      {!storageOk && <div className="banner">{t('storageUnavailableBanner', lang)}</div>}
      <MapView />
      <Toast />
    </div>
  );
}
