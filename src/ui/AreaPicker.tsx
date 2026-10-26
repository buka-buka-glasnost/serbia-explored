import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/store';
import { areaName, t } from '../i18n/i18n';
import { loose } from '../logic/search';
import type { AreaProps, Lang } from '../shared/types';

const MAX_SUGGESTIONS = 10;

const matches = (a: AreaProps, q: string): boolean =>
  [areaName(a, 'sr-Cyrl'), areaName(a, 'sr-Latn'), areaName(a, 'en'), a.nameSq].some(
    (n) => n !== undefined && loose(n).includes(q),
  );

export function suggestAreas(areas: AreaProps[], query: string, kosovoShown: boolean): AreaProps[] {
  const q = loose(query.trim());
  if (!q) return [];
  const pool = areas.filter((a) => (kosovoShown || !a.inKosovo) && matches(a, q));
  return [
    ...pool.filter((a) => a.level === 'district'),
    ...pool.filter((a) => a.level === 'municipality'),
  ].slice(0, MAX_SUGGESTIONS);
}

function AreaParent({ districtId, lang }: { districtId?: string; lang: Lang }) {
  const district = useApp((s) => (districtId ? s.areasById.get(districtId)?.properties : undefined));
  return district ? <span className="area-parent">{' · '}{areaName(district, lang)}</span> : null;
}

export function AreaPicker() {
  const areas = useApp((s) => s.areas);
  const areasById = useApp((s) => s.areasById);
  const areaId = useApp((s) => s.areaId);
  const setArea = useApp((s) => s.setArea);
  const picking = useApp((s) => s.picking);
  const setPicking = useApp((s) => s.setPicking);
  const kosovoShown = useApp((s) => s.settings.kosovoShown);
  const lang: Lang = useApp((s) => s.settings.lang);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(-1);

  const props = useMemo(() => areas?.features.map((f) => f.properties) ?? [], [areas]);
  const current = areaId ? areasById.get(areaId)?.properties : undefined;
  const found = useMemo(() => suggestAreas(props, text, kosovoShown), [props, text, kosovoShown]);
  const suggestions = open ? found : [];

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPicking(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking, setPicking]);

  const choose = (id: string) => {
    setArea(id);
    setText('');
    setActive(-1);
  };
  const clear = () => {
    setArea(null);
    setText('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (found.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const n = found.length;
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === 'Enter') {
      const pick = suggestions[active >= 0 ? active : 0];
      if (pick) {
        e.preventDefault();
        choose(pick.id);
      }
    } else if (e.key === 'Escape' && suggestions.length > 0) {
      setOpen(false);
    }
  };

  return (
    <section className="area-picker">
      <div className="area-row">
        <input
          type="search"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="area-suggestions"
          aria-activedescendant={active >= 0 && suggestions[active] ? `area-opt-${suggestions[active].id}` : undefined}
          aria-label={t('areaSearch', lang)}
          placeholder={current ? areaName(current, lang) : t('areaSearch', lang)}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
        />
        {areaId && (
          <button type="button" className="btn area-clear" aria-label={t('clearArea', lang)} onClick={clear}>×</button>
        )}
        <button
          type="button"
          className={picking ? 'btn area-pick active' : 'btn area-pick'}
          aria-label={t('pickOnMap', lang)}
          title={t('pickOnMap', lang)}
          aria-pressed={picking}
          onClick={() => setPicking(!picking)}
        >
          ⌖
        </button>
      </div>
      {suggestions.length > 0 && (
        <ul id="area-suggestions" role="listbox" className="area-suggestions">
          {suggestions.map((a, i) => (
            <li
              key={a.id}
              id={`area-opt-${a.id}`}
              role="option"
              className={i === active ? 'active' : undefined}
              aria-selected={i === active}
              onClick={() => choose(a.id)}
            >
              {areaName(a, lang)}
              {a.level === 'municipality' && <AreaParent districtId={a.districtId} lang={lang} />}
            </li>
          ))}
        </ul>
      )}
      {picking && <p className="area-hint">{t('pickOnMapHint', lang)}</p>}
    </section>
  );
}
