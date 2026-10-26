import { useEffect, useRef } from 'react';
import { useApp } from '../state/store';
import { areaName, placeDescription, placeName, placeType, t } from '../i18n/i18n';
import { toLatin } from '../shared/translit';
import type { Access, Designation, Lang, Place } from '../shared/types';
import type { StringKey } from '../i18n/strings';
import { VisitEditor } from './VisitEditor';
import { useIsNarrow } from './useIsNarrow';

const ACCESS_KEY: Record<Access, StringKey> = {
  door: 'accessDoor',
  rough: 'accessRough',
  hike_boat: 'accessHikeBoat',
};
const ACCESS_ICON: Record<Access, string> = { door: '🚗', rough: '🛻', hike_boat: '🥾' };
const WORLD_CLASS: ReadonlySet<Designation> = new Set(['unesco_whs', 'unesco_whs_part', 'unesco_geopark', 'unesco_biosphere']);

// Bottom-sheet drag: close past this distance, or on a quick downward flick.
const DISMISS_PX = 120;
const DISMISS_VELOCITY = 0.11; // px per ms

function partOfName(p: NonNullable<Place['partOf']>, lang: Lang): string {
  if (lang === 'sr-Cyrl') return p.nameSr;
  return lang === 'en' && p.nameEn ? p.nameEn : toLatin(p.nameSr);
}

/** Wikipedia link in the current language, falling back to the other one. */
function wikipediaLink(p: Place, lang: Lang): { href: string } | null {
  const pick = (code: 'sr' | 'en', title?: string) =>
    title ? { href: `https://${code}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` } : null;
  return lang === 'en'
    ? pick('en', p.wikipediaEn) ?? pick('sr', p.wikipediaSr)
    : pick('sr', p.wikipediaSr) ?? pick('en', p.wikipediaEn);
}

/** How far back the release velocity looks. */
const VELOCITY_WINDOW_MS = 100;

/** Pointer handlers that let the bottom sheet be dragged down to close. */
function useSheetDrag(sheet: React.RefObject<HTMLElement | null>, onDismiss: () => void) {
  const drag = useRef<{ y: number; dy: number; id: number; samples: { y: number; t: number }[] } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (drag.current || !sheet.current) return; // ignore extra fingers
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    drag.current = { y: e.clientY, dy: 0, id: e.pointerId, samples: [{ y: e.clientY, t: performance.now() }] };
    sheet.current.classList.add('dragging');
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || !sheet.current) return;
    const now = performance.now();
    d.samples.push({ y: e.clientY, t: now });
    while (d.samples.length > 2 && now - d.samples[1].t > VELOCITY_WINDOW_MS) d.samples.shift();
    const raw = e.clientY - d.y;
    d.dy = raw < 0 ? raw * 0.2 : raw; // friction when pulled up
    sheet.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = sheet.current;
    if (!d || e.pointerId !== d.id || !el) return;
    drag.current = null;
    // velocity over the last ~100 ms, so a slow drag that ends in a flick still counts
    const now = performance.now();
    const from = d.samples.find((s) => now - s.t <= VELOCITY_WINDOW_MS) ?? d.samples[d.samples.length - 1];
    const velocity = (e.clientY - from.y) / Math.max(1, now - from.t);
    el.classList.remove('dragging');
    if (d.dy > DISMISS_PX || (d.dy > 10 && velocity > DISMISS_VELOCITY)) {
      el.style.transform = 'translateY(100%)'; // slide on from where the finger left it
      onDismiss();
    } else {
      el.style.transform = ''; // snap back
    }
  };
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}

export function PlaceCard({ place, closing = false, headingRef }: {
  place: Place; closing?: boolean; headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const lang = useApp((s) => s.settings.lang);
  const municipality = useApp((s) =>
    (place.municipalityId ? s.areasById.get(place.municipalityId)?.properties : undefined));
  const visited = useApp((s) => !!s.visits[place.id]);
  const inTrip = useApp((s) => s.trip.stopIds.includes(place.id));
  const markVisited = useApp((s) => s.markVisited);
  const addToTrip = useApp((s) => s.addToTrip);
  const removeFromTrip = useApp((s) => s.removeFromTrip);
  const isStart = useApp((s) => s.trip.startPlaceId === place.id);
  const setTripStart = useApp((s) => s.setTripStart);
  const select = useApp((s) => s.select);
  const dataVersion = useApp((s) => s.dataVersion);
  const narrow = useIsNarrow();
  const ref = useRef<HTMLElement>(null);
  const dragHandlers = useSheetDrag(ref, () => select(null));
  // A sheet dismissed by dragging keeps its off-screen transform; drop it if the card is reused.
  useEffect(() => {
    if (!closing && ref.current) ref.current.style.transform = '';
  }, [closing]);

  const type = placeType(place, lang);
  const desc = placeDescription(place, lang);
  const wiki = wikipediaLink(place, lang);
  const name = placeName(place, lang);

  return (
    <article
      ref={ref}
      className={narrow ? 'place-card bottom-sheet' : 'place-card'}
      aria-label={name}
      data-state={closing ? 'closing' : 'open'}
      aria-hidden={closing || undefined}
      inert={closing || undefined}
    >
      {narrow && <div className="sheet-handle" aria-hidden="true" {...dragHandlers} />}
      <button type="button" className="card-close" aria-label={t('close', lang)} onClick={() => select(null)}>
        ×
      </button>
      {place.photo && (
        <figure className="card-photo" key={place.id}>
          <img src={place.photo.url} alt={name} />
          <figcaption>
            <a href={place.photo.sourceUrl} target="_blank" rel="noopener noreferrer">
              {`© ${place.photo.author}, ${place.photo.license}`}
            </a>
          </figcaption>
        </figure>
      )}
      <div className="card-body">
        <h2 ref={headingRef} tabIndex={-1}>{name}</h2>
        {place.designations.length > 0 && (
          <ul className="badges">
            {place.designations.map((d) => (
              <li key={d} className={WORLD_CLASS.has(d) ? 'badge tier1' : 'badge'}>{t(`designation_${d}`, lang)}</li>
            ))}
          </ul>
        )}
        {place.partOf && <p className="card-partof">{t('partOf', lang)}{partOfName(place.partOf, lang)}</p>}
        {(type || municipality) && (
          <p className="card-meta">
            <span aria-hidden="true">{place.kind === 'nature' ? '🌲 ' : '🏛 '}</span>
            {[type, municipality && areaName(municipality, lang)].filter(Boolean).join(' · ')}
          </p>
        )}
        {desc && (
          <div className="card-desc">
            <p>{desc.text}</p>
            {desc.untranslated && <p className="note">{t('notTranslated', lang)}</p>}
          </div>
        )}
        <p className="card-access">
          <span aria-hidden="true">{place.access ? ACCESS_ICON[place.access] : '❔'}</span>
          <span>
            {place.access ? t(ACCESS_KEY[place.access], lang) : t('accessUnknown', lang)}
            {place.access && place.accessEstimated && <span aria-hidden="true">*</span>}
          </span>
        </p>
        {place.access && place.accessEstimated && <p className="note">* {t('accessEstimated', lang)}</p>}
        {wiki && (
          <p className="card-links">
            <a href={wiki.href} target="_blank" rel="noopener noreferrer">{t('wikipedia', lang)} ↗</a>
          </p>
        )}
        <div className="card-actions">
          <button
            type="button"
            className={visited ? 'btn btn-primary done' : 'btn btn-primary'}
            disabled={visited}
            onClick={() => void markVisited(place.id)}
          >
            <span className="btn-content" key={visited ? 'done' : 'todo'}>
              {visited ? `✓ ${t('visited', lang)}` : t('markVisited', lang)}
            </span>
          </button>
          <div className="row">
            <button type="button" className="btn" onClick={() => (inTrip ? removeFromTrip(place.id) : addToTrip(place.id))}>
              {t(inTrip ? 'removeFromTrip' : 'addToTrip', lang)}
            </button>
          </div>
          <button type="button" className="btn-link" disabled={isStart} onClick={() => setTripStart(place.id)}>
            {t('setTripStart', lang)}
          </button>
        </div>
        {/* re-keyed after a backup import so the editor shows the imported note */}
        {visited && <VisitEditor key={`${place.id}:${dataVersion}`} placeId={place.id} />}
      </div>
    </article>
  );
}
