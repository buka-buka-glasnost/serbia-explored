import { useApp } from '../state/store';
import { placeName, t } from '../i18n/i18n';
import { buildDirectionsUrl, routeStops } from '../trip/googleMaps';
import type { Place } from '../shared/types';

export function TripPanel() {
  const lang = useApp((s) => s.settings.lang);
  const kosovoShown = useApp((s) => s.settings.kosovoShown);
  const trip = useApp((s) => s.trip);
  const placesById = useApp((s) => s.placesById);
  const visits = useApp((s) => s.visits);
  const { moveTripStop, removeFromTrip, setTripStart, optimiseTrip, markVisited } = useApp.getState();

  const stops = trip.stopIds.map((id) => placesById.get(id)).filter((p): p is Place => !!p);
  const startPlace = trip.startPlaceId ? placesById.get(trip.startPlaceId) : undefined;
  const startOptions = startPlace && !trip.stopIds.includes(startPlace.id) ? [...stops, startPlace] : stops;

  const driveStops = routeStops(stops, trip.startPlaceId);
  const open = () => {
    if (driveStops.length === 0) return;
    window.open(buildDirectionsUrl(driveStops, startPlace), '_blank', 'noopener');
  };

  return (
    <section className="trip-panel" aria-label={t('tripTab', lang)}>
      <label>
        {t('startFrom', lang)}
        <select value={trip.startPlaceId ?? ''} onChange={(e) => setTripStart(e.target.value || null)}>
          <option value="">{t('currentLocation', lang)}</option>
          {startOptions.map((p) => (
            <option key={p.id} value={p.id}>{placeName(p, lang)}</option>
          ))}
        </select>
      </label>
      {stops.length === 0 ? (
        <p>{t('tripEmpty', lang)}</p>
      ) : (
        <ol className="trip-stops">
          {stops.map((p, i) => (
            <li key={p.id}>
              <span className="stop-name">
                {placeName(p, lang)}
                {p.inKosovo && !kosovoShown && <span className="stop-note"> ({t('hiddenOnMap', lang)})</span>}
              </span>
              <button type="button" className="btn" aria-label={t('moveUp', lang)} disabled={i === 0} onClick={() => moveTripStop(p.id, -1)}>↑</button>
              <button type="button" className="btn" aria-label={t('moveDown', lang)} disabled={i === stops.length - 1} onClick={() => moveTripStop(p.id, 1)}>↓</button>
              <button
                type="button"
                className="btn"
                aria-label={t('markVisited', lang)}
                disabled={!!visits[p.id]}
                onClick={() => void markVisited(p.id)}
              >✓</button>
              <button type="button" className="btn" aria-label={t('removeStop', lang)} onClick={() => removeFromTrip(p.id)}>✕</button>
            </li>
          ))}
        </ol>
      )}
      <div className="trip-actions">
        <button type="button" className="btn" disabled={stops.length < 2} onClick={optimiseTrip}>{t('optimiseOrder', lang)}</button>
        <button type="button" className="btn btn-primary" disabled={driveStops.length === 0} onClick={open}>{t('openInGoogleMaps', lang)}</button>
      </div>
    </section>
  );
}
