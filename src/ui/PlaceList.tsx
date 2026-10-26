import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { areaName, placeName, placeType, t } from '../i18n/i18n';
import { filterPlaces, sortForDisplay, splitByArea } from '../logic/filters';
import type { AreaProps, Place } from '../shared/types';

const ROW_HEIGHT = 52;
const VIRTUALISE_ABOVE = 500;
const OVERSCAN = 8;

type Row = { kind: 'place'; place: Place; dim: boolean } | { kind: 'heading'; label: string };

export function PlaceList({ onSelect }: { onSelect?: () => void } = {}) {
  const places = useApp((s) => s.places);
  const settings = useApp((s) => s.settings);
  const query = useApp((s) => s.query);
  const areas = useApp((s) => s.areas);
  const areaId = useApp((s) => s.areaId);
  const visits = useApp((s) => s.visits);
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const { lang } = settings;

  const filtered = useMemo(() => sortForDisplay(filterPlaces(places, settings, query), lang),
    [places, settings, query, lang],);
  const area = useMemo(
    () => (areaId ? areas?.features.find((f) => f.properties.id === areaId) ?? null : null),
    [areas, areaId],
  );
  const split = useMemo(
    () => (area ? splitByArea(filtered, area as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProps>) : null),
    [filtered, area],
  );

  const rows: Row[] = useMemo(() => {
    if (!split) return filtered.map((place) => ({ kind: 'place', place, dim: false }));
    return [
      ...split.inside.map((place): Row => ({ kind: 'place', place, dim: false })),
      ...(split.nearby.length > 0 ? [{ kind: 'heading', label: t('nearby', lang) } as Row] : []),
      ...split.nearby.map((place): Row => ({ kind: 'place', place, dim: true })),
    ];
  }, [filtered, split, lang]);

  const municipalities = useMemo(
    () => new Map((areas?.features ?? []).map((f) => [f.properties.id, f.properties])),
    [areas],
  );
  const metaLine = (p: Place) => {
    const m = p.municipalityId ? municipalities.get(p.municipalityId) : undefined;
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

  const renderRow = (row: Row, style?: React.CSSProperties) => {
    if (row.kind === 'heading') {
      return <h3 key="nearby-heading" className="list-heading" style={style}>{row.label}</h3>;
    }
    const meta = metaLine(row.place);
    return (
      <button
        key={row.place.id}
        type="button"
        className={`place-row${row.dim ? ' dim' : ''}${row.place.id === selectedId ? ' selected' : ''}`}
        style={style}
        aria-current={row.place.id === selectedId ? 'true' : undefined}
        onClick={() => { select(row.place.id); onSelect?.(); }}
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
      <div className="place-list" aria-label={t('placeList', lang)}>
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
