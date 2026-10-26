import { MapControl } from './MapControl';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';

export function InfoButtonView() {
  const lang = useApp((s) => s.settings.lang);
  const setWelcomeOpen = useApp((s) => s.setWelcomeOpen);
  return (
    <button
      type="button"
      className="info-button"
      aria-label={t('aboutApp', lang)}
      title={t('aboutApp', lang)}
      onClick={() => setWelcomeOpen(true)}
    >
      i
    </button>
  );
}

/** Always-visible "i" control (top left, under the zoom buttons) that reopens the welcome message. */
export function InfoButton() {
  return (
    <MapControl position="topleft" className="leaflet-bar info-control">
      <InfoButtonView />
    </MapControl>
  );
}
