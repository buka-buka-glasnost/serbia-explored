import { MapControl } from './MapControl';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';

const TIERS = [1, 2, 3, 4] as const;

export function LegendView() {
  const lang = useApp((s) => s.settings.lang);
  return (
    <details open>
      <summary>{t('legend', lang)}</summary>
      <ul>
        {TIERS.map((n) => (
          <li key={n}>
            <span className={`dot tier${n}`} aria-hidden="true" />
            {t(`tier${n}`, lang)}
          </li>
        ))}
        <li><span className="ring visited" aria-hidden="true" />{t('visited', lang)}</li>
        <li><span className="ring trip" aria-hidden="true" />{t('legendTrip', lang)}</li>
      </ul>
    </details>
  );
}

/** Bottom-left map legend (hidden on phones by CSS). */
export function Legend() {
  return (
    <MapControl position="bottomleft" className="leaflet-bar legend">
      <LegendView />
    </MapControl>
  );
}
