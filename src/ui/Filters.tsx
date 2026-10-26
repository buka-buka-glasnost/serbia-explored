import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import type { PlaceKind, Tier } from '../shared/types';

const TIERS: Tier[] = [1, 2, 3, 4];
const KINDS: PlaceKind[] = ['culture', 'nature'];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function Filters() {
  const settings = useApp((s) => s.settings);
  const query = useApp((s) => s.query);
  const setQuery = useApp((s) => s.setQuery);
  const setSettings = useApp((s) => s.setSettings);
  const { lang } = settings;
  return (
    <section className="filters">
      <input
        type="search"
        value={query}
        placeholder={t('searchPlaceholder', lang)}
        aria-label={t('searchPlaceholder', lang)}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="filter-group">
        {TIERS.map((n) => (
          <label key={n}>
            <input
              type="checkbox"
              checked={settings.tiers.includes(n)}
              onChange={() => setSettings({ tiers: toggle(settings.tiers, n).sort() })}
            />
            {t(`tier${n}`, lang)}
          </label>
        ))}
      </div>
      <div className="filter-group">
        {KINDS.map((k) => (
          <label key={k}>
            <input
              type="checkbox"
              checked={settings.kinds.includes(k)}
              onChange={() => setSettings({ kinds: toggle(settings.kinds, k) })}
            />
            {t(k, lang)}
          </label>
        ))}
      </div>
    </section>
  );
}
