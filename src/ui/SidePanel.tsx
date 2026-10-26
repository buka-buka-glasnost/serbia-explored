import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { LanguageSwitch } from './LanguageSwitch';
import { ProgressSummary } from './ProgressSummary';
import { Filters } from './Filters';
import { PlaceList } from './PlaceList';
import { BackupControls } from './BackupControls';

export function SidePanel() {
  const lang = useApp((s) => s.settings.lang);
  return (
    <aside className="side-panel">
      <header className="panel-header">
        <h1>{t('appTitle', lang)}</h1>
        <LanguageSwitch />
      </header>
      <ProgressSummary />
      <Filters />
      <PlaceList />
      <BackupControls />
    </aside>
  );
}
