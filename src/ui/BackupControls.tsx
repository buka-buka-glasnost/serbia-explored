import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import {
  BackupFormatError, backupFileName, exportBackup, importBackup, readBackupSummary,
} from '../storage/backup';
import { getAllVisits, getMeta, type TripState } from '../storage/db';
import type { Settings } from '../logic/filters';

async function reloadFromStorage() {
  const [visits, trip, settings] = await Promise.all([
    getAllVisits(), getMeta<TripState>('trip'), getMeta<Settings>('settings'),
  ]);
  useApp.setState((s) => ({
    visits: Object.fromEntries(visits.map((v) => [v.placeId, v])),
    trip: trip ?? s.trip,
    settings: { ...s.settings, ...settings },
  }));
}

export function BackupControls() {
  const lang = useApp((s) => s.settings.lang);
  const storageOk = useApp((s) => s.storageOk);

  const onExport = async () => {
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      useApp.getState().showToast('storageError', 'error');
    }
  };

  const onImport = async (file: File | undefined, input: HTMLInputElement) => {
    input.value = '';
    if (!file) return;
    const { showToast } = useApp.getState();
    try {
      const summary = await readBackupSummary(file);
      const counts = t('importCounts', lang)
        .replace('{visits}', String(summary.visits))
        .replace('{photos}', String(summary.photos));
      if (!window.confirm(`${t('importConfirm', lang)}\n\n${counts}`)) return;
      await importBackup(file);
      await reloadFromStorage();
      showToast('importDone', 'info');
    } catch (e) {
      showToast(e instanceof BackupFormatError ? 'importInvalid' : 'storageError', 'error');
    }
  };

  return (
    <footer className="backup">
      {!storageOk && <div className="banner" role="alert">{t('storageUnavailableBanner', lang)}</div>}
      <div className="backup-buttons">
        <button type="button" onClick={() => void onExport()}>{t('export', lang)}</button>
        <label className="button">
          {t('import', lang)}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void onImport(e.target.files?.[0], e.target)}
          />
        </label>
      </div>
    </footer>
  );
}
