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

export function AreaPicker() {
  const areas = useApp((s) => s.areas);
  const areaId = useApp((s) => s.areaId);
  const setArea = useApp((s) => s.setArea);
  const picking = useApp((s) => s.picking);
  const setPicking = useApp((s) => s.setPicking);
  const kosovoShown = useApp((s) => s.settings.kosovoShown);
  const lang: Lang = useApp((s) => s.settings.lang);
  const [text, setText] = useState('');

  const props = useMemo(() => areas?.features.map((f) => f.properties) ?? [], [areas]);
  const current = props.find((p) => p.id === areaId);
  const suggestions = useMemo(() => suggestAreas(props, text, kosovoShown), [props, text, kosovoShown]);

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
  };
  const clear = () => {
    setArea(null);
    setText('');
  };

  return (
    <section className="area-picker">
      <div className="area-row">
        <input
          type="search"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="area-suggestions"
          aria-label={t('areaSearch', lang)}
          placeholder={current ? areaName(current, lang) : t('areaSearch', lang)}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {areaId && (
          <button type="button" className="area-clear" aria-label={t('clearArea', lang)} onClick={clear}>×</button>
        )}
      </div>
      {suggestions.length > 0 && (
        <ul id="area-suggestions" role="listbox" className="area-suggestions">
          {suggestions.map((a) => (
            <li key={a.id} role="option" aria-selected={a.id === areaId} onClick={() => choose(a.id)}>
              {areaName(a, lang)}
              {a.level === 'municipality' && a.districtId && props.some((p) => p.id === a.districtId) && (
                <span className="area-parent">
                  {' · '}
                  {areaName(props.find((p) => p.id === a.districtId)!, lang)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className={picking ? 'area-pick active' : 'area-pick'}
        onClick={() => setPicking(!picking)}
      >
        {t('pickOnMap', lang)}
      </button>
      {picking && <p className="area-hint">{t('pickOnMapHint', lang)}</p>}
    </section>
  );
}
