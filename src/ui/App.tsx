import { useEffect } from 'react';
import { useApp } from '../state/store';
import { MapView } from '../map/MapView';
import { SidePanel } from './SidePanel';
import { PlaceCard } from './PlaceCard';
import { Toast } from './Toast';
import './app.css';

export function App() {
  const status = useApp((s) => s.status);
  const selected = useApp((s) => (s.selectedId ? s.placesById.get(s.selectedId) : undefined));
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
      <SidePanel />
      <main className="map-area">
        <MapView />
        {selected && <PlaceCard place={selected} />}
      </main>
      <Toast />
    </div>
  );
}
