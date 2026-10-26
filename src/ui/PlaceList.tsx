import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { useVisiblePlaces } from '../state/visiblePlaces';
import { areaName, placeName, placeType, t } from '../i18n/i18n';
import { sortForDisplay } from '../logic/filters';
import type { Place } from '../shared/types';

const ROW_HEIGHT = 52;
const VIRTUALISE_ABOVE = 500;
const OVERSCAN = 8;

type Row = { kind: 'place'; place: Place; dim: boolean } | { kind: 'heading'; label: string };

/** `onSelect` gets the row a place was chosen from (before the selection changes). */
export function PlaceList({ onSelect }: { onSelect?: (row: HTMLElement) => void } = {}) {
  const lang = useApp((s) => s.settings.lang);
  const areasById = useApp((s) => s.areasById);
  const visits = useApp((s) => s.visits);
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const { filtered, split } = useVisiblePlaces();

  const rows: Row[] = useMemo(() => {
    const placeRows = (ps: Place[], dim: boolean) =>
      sortForDisplay(ps, lang).map((place): Row => ({ kind: 'place', place, dim }));
    if (!split) return placeRows(filtered, false);
    return [
      ...placeRows(split.inside, false),
      ...(split.nearby.length > 0 ? [{ kind: 'heading', label: t('nearby', lang) } as Row] : []),
      ...placeRows(split.nearby, true),
    ];
  }, [filtered, split, lang]);

  const metaLine = (p: Place) => {
    const m = p.municipalityId ? areasById.get(p.municipalityId)?.properties : undefined;
    return [placeType(p, lang), m && areaName(m, lang)].filter(Boolean).join(' · ');
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);
  const virtual = rows.length > VIRTUALISE_ABOVE;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !virtual) return;
    const measure = () => setViewport(el.clientHeight || 600);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [virtual]);

  // Keep the selected row in view (it may have been chosen on the map). Rows are all
  // ROW_HEIGHT tall, so this works the same with and without virtualisation.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !selectedId) return;
    const i = rowsRef.current.findIndex((r) => r.kind === 'place' && r.place.id === selectedId);
    if (i < 0) return;
    const top = i * ROW_HEIGHT;
    const height = el.clientHeight;
    if (top >= el.scrollTop && top + ROW_HEIGHT <= el.scrollTop + height) return;
    el.scrollTop = Math.max(0, top - (height - ROW_HEIGHT) / 2);
    setScrollTop(el.scrollTop);
  }, [selectedId]);

  const renderRow = (row: Row, style?: React.CSSProperties) => {
    if (row.kind === 'heading') {
      return <h3 key="nearby-heading" className="list-heading" style={style}>{row.label}</h3>;
    }
    const meta = metaLine(row.place);
    return (
      <button
        key={row.place.id}
        type="button"
        data-place-id={row.place.id}
        className={`place-row${row.dim ? ' dim' : ''}${row.place.id === selectedId ? ' selected' : ''}`}
        style={style}
        aria-current={row.place.id === selectedId ? 'true' : undefined}
        onClick={(e) => { onSelect?.(e.currentTarget); select(row.place.id); }}
      >
        <span className={`dot tier${row.place.tier}`} aria-hidden="true" />
        <span className="place-row-text">
          <span className="place-row-name">{placeName(row.place, lang)}</span>
          {meta && <span className="place-row-meta">{meta}</span>}
        </span>
        {visits[row.place.id] && (
          <span className="place-row-check">
            <span aria-hidden="true">✓</span>
            <span className="sr-only">{t('visited', lang)}</span>
          </span>
        )}
      </button>
    );
  };

  if (rows.length === 0) return <div className="place-list empty">{t('noResults', lang)}</div>;

  if (!virtual) {
    return (
      <div className="place-list" aria-label={t('placeList', lang)} ref={scrollRef}>
        {rows.map((r) => renderRow(r))}
      </div>
    );
  }

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  return (
    <div
      className="place-list"
      aria-label={t('placeList', lang)}
      ref={scrollRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
        {rows.slice(first, last).map((r, i) =>
          renderRow(r, { position: 'absolute', top: (first + i) * ROW_HEIGHT, height: ROW_HEIGHT, left: 0, right: 0 }),
        )}
      </div>
    </div>
  );
}
