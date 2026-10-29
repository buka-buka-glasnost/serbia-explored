import type { Ref } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import type { PlaceKind, Tier } from '../shared/types';

const TIERS: Tier[] = [1, 2, 3, 4];
const KINDS: PlaceKind[] = ['culture', 'nature'];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** The place search box. `onType` runs on every change (the phone sheet uses it to show the list). */
export function SearchField({ inputRef, onType }: { inputRef?: Ref<HTMLInputElement>; onType?: () => void }) {
  const query = useApp((s) => s.query);
  const setQuery = useApp((s) => s.setQuery);
  const lang = useApp((s) => s.settings.lang);
  return (
    <input
      ref={inputRef}
      type="search"
      value={query}
      placeholder={t('searchPlaceholder', lang)}
      aria-label={t('searchPlaceholder', lang)}
      onChange={(e) => {
        setQuery(e.target.value);
        onType?.();
      }}
    />
  );
}

/** Search box and tier/kind chips. On phones the search box lives in the sheet's top row instead (`search={false}`). */
export function Filters({ search = true }: { search?: boolean }) {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const { lang } = settings;
  return (
    <section className="filters">
      {search && <SearchField />}
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
