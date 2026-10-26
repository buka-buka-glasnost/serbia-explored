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
      <div className="chips" role="group">
        {TIERS.map((n) => (
          <button
            key={n}
            type="button"
            className="chip"
            title={t(`tier${n}`, lang)}
            aria-pressed={settings.tiers.includes(n)}
            onClick={() => setSettings({ tiers: toggle(settings.tiers, n).sort() })}
          >
            <span className={`dot tier${n}`} aria-hidden="true" />
            {t(`tierShort${n}`, lang)}
          </button>
        ))}
      </div>
      <div className="chips" role="group">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={settings.kinds.includes(k)}
            onClick={() => setSettings({ kinds: toggle(settings.kinds, k) })}
          >
            <span aria-hidden="true">{k === 'culture' ? '🏛' : '🌲'}</span>
            {t(k, lang)}
          </button>
        ))}
      </div>
    </section>
  );
}
