import { useState } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { LanguageSwitch } from './LanguageSwitch';
import { ProgressSummary } from './ProgressSummary';
import { AreaPicker } from './AreaPicker';
import { Filters } from './Filters';
import { PlaceList } from './PlaceList';
import { TripPanel } from './TripPanel';
import { BackupControls } from './BackupControls';

export function SidePanel() {
  const lang = useApp((s) => s.settings.lang);
  const tripCount = useApp((s) => s.trip.stopIds.length);
  const [tab, setTab] = useState<'places' | 'trip'>('places');
  return (
    <aside className="side-panel">
      <header className="panel-header">
        <h1>{t('appTitle', lang)}</h1>
        <LanguageSwitch />
      </header>
      <ProgressSummary />
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'places'} onClick={() => setTab('places')}>
          {t('placesTab', lang)}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'trip'} onClick={() => setTab('trip')}>
          {t('tripTab', lang)}
          {tripCount > 0 && <span className="badge-count">{tripCount}</span>}
        </button>
      </div>
      {tab === 'places' ? (
        <>
          <AreaPicker />
          <Filters />
          <PlaceList />
        </>
      ) : (
        <TripPanel />
      )}
      <BackupControls />
    </aside>
  );
}
