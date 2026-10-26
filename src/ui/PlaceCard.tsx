import { useApp } from '../state/store';
import { areaName, placeDescription, placeName, t } from '../i18n/i18n';
import { toLatin } from '../shared/translit';
import type { Access, Lang, Place } from '../shared/types';
import type { StringKey } from '../i18n/strings';
import { VisitEditor } from './VisitEditor';

const ACCESS_KEY: Record<Access, StringKey> = {
  door: 'accessDoor',
  rough: 'accessRough',
  hike_boat: 'accessHikeBoat',
};

function placeType(p: Place, lang: Lang): string | undefined {
  if (lang === 'en') return p.typeEn ?? (p.typeSr ? toLatin(p.typeSr) : undefined);
  if (!p.typeSr) return undefined;
  return lang === 'sr-Latn' ? toLatin(p.typeSr) : p.typeSr;
}

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

export function PlaceCard({ place }: { place: Place }) {
  const lang = useApp((s) => s.settings.lang);
  const areas = useApp((s) => s.areas);
  const visited = useApp((s) => !!s.visits[place.id]);
  const inTrip = useApp((s) => s.trip.stopIds.includes(place.id));
  const markVisited = useApp((s) => s.markVisited);
  const addToTrip = useApp((s) => s.addToTrip);
  const removeFromTrip = useApp((s) => s.removeFromTrip);
  const isStart = useApp((s) => s.trip.startPlaceId === place.id);
  const setTripStart = useApp((s) => s.setTripStart);
  const select = useApp((s) => s.select);

  const municipality = place.municipalityId
    ? areas?.features.find((f) => f.properties.id === place.municipalityId)?.properties
    : undefined;
  const type = placeType(place, lang);
  const desc = placeDescription(place, lang);
  const wiki = wikipediaLink(place, lang);

  return (
    <article className="place-card" aria-label={placeName(place, lang)}>
      <button type="button" className="card-close" aria-label={t('close', lang)} onClick={() => select(null)}>
        ×
      </button>
      {place.photo && (
        <figure className="card-photo">
          <img src={place.photo.url} alt={placeName(place, lang)} loading="lazy" />
          <figcaption>
            <a href={place.photo.sourceUrl} target="_blank" rel="noopener noreferrer">
              {`© ${place.photo.author}, ${place.photo.license}`}
            </a>
          </figcaption>
        </figure>
      )}
      <h2>{placeName(place, lang)}</h2>
      {place.designations.length > 0 && (
        <ul className="badges">
          {place.designations.map((d) => (
            <li key={d} className="badge">{t(`designation_${d}`, lang)}</li>
          ))}
        </ul>
      )}
      {place.partOf && <p className="card-partof">{t('partOf', lang)}{partOfName(place.partOf, lang)}</p>}
      {(type || municipality) && (
        <p className="card-meta">{[type, municipality && areaName(municipality, lang)].filter(Boolean).join(' · ')}</p>
      )}
      {desc && (
        <div className="card-desc">
          <p>{desc.text}</p>
          {desc.untranslated && <p className="note">{t('notTranslated', lang)}</p>}
        </div>
      )}
      <p className="card-access">{place.access ? t(ACCESS_KEY[place.access], lang) : t('accessUnknown', lang)}</p>
      {wiki && (
        <p>
          <a href={wiki.href} target="_blank" rel="noopener noreferrer">{t('wikipedia', lang)}</a>
        </p>
      )}
      <div className="card-actions">
        {!visited && (
          <button type="button" onClick={() => void markVisited(place.id)}>{t('markVisited', lang)}</button>
        )}
        <button type="button" onClick={() => (inTrip ? removeFromTrip(place.id) : addToTrip(place.id))}>
          {t(inTrip ? 'removeFromTrip' : 'addToTrip', lang)}
        </button>
        <button type="button" disabled={isStart} onClick={() => setTripStart(place.id)}>
          {t('setTripStart', lang)}
        </button>
      </div>
      {visited && <VisitEditor key={place.id} placeId={place.id} />}
    </article>
  );
}
