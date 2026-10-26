import L from 'leaflet';
import type { Lang, Place } from '../shared/types';
import { placeName } from '../i18n/i18n';
import { markerStyle } from './markerStyle';

/** The part of a marker cluster group the sync uses. */
export interface MarkerGroup {
  addLayers(layers: L.Layer[]): unknown;
  removeLayers(layers: L.Layer[]): unknown;
}

export interface MarkerState {
  visited: (id: string) => boolean;
  inTrip: (id: string) => boolean;
  selectedId: string | null;
  /** Area-based opacity, 1 when no area is selected. */
  opacity: (id: string) => number;
}

const SELECTED_RING = '#24508a'; // --accent

/** Full Leaflet style of one marker: tier fill, visit/trip ring, selection ring and area opacity. */
export function fullMarkerStyle(p: Place, visited: boolean, inTrip: boolean, selected: boolean, opacity: number): L.CircleMarkerOptions {
  const base = markerStyle(p, visited, inTrip);
  return {
    ...base,
    // set explicitly so a restyle also clears a dash left by an earlier style
    dashArray: selected ? undefined : base.dashArray,
    ...(selected ? { radius: base.radius + 3, color: SELECTED_RING, weight: 3.5 } : {}),
    fillOpacity: 0.9 * opacity,
    opacity,
  };
}

/**
 * Keeps one circle marker per place and updates them in place: the visible set is
 * diffed (markers are created once and reused), styles are re-applied only where
 * they changed, and tooltips are re-labelled on a language change.
 */
export class MarkerSync {
  private readonly markers = new Map<string, L.CircleMarker>();
  private readonly places = new Map<string, Place>();
  private readonly styleKeys = new Map<string, string>();
  private visible = new Set<string>();
  private lang: Lang;

  constructor(
    private readonly group: MarkerGroup,
    lang: Lang,
    private readonly onClick: (p: Place) => void,
  ) {
    this.lang = lang;
  }

  private marker(p: Place): L.CircleMarker {
    let m = this.markers.get(p.id);
    if (!m) {
      // no bubbling: in picking mode the click handler picks the area itself
      m = L.circleMarker([p.lat, p.lon], { ...fullMarkerStyle(p, false, false, false, 1), bubblingMouseEvents: false });
      m.bindTooltip(placeName(p, this.lang));
      m.on('click', () => this.onClick(p));
      this.markers.set(p.id, m);
      this.places.set(p.id, p);
    }
    return m;
  }

  /** Shows exactly these places; style them with `state`. */
  setVisible(places: Place[], state: MarkerState): void {
    const next = new Set(places.map((p) => p.id));
    const gone = [...this.visible].filter((id) => !next.has(id)).map((id) => this.markers.get(id)!);
    const added = places.filter((p) => !this.visible.has(p.id));
    // style before adding so new markers render right the first time
    for (const p of added) this.apply(p.id, this.marker(p), state);
    if (gone.length) this.group.removeLayers(gone);
    if (added.length) this.group.addLayers(added.map((p) => this.markers.get(p.id)!));
    this.visible = next;
    this.restyle(state);
  }

  /** Re-applies styles of visible markers whose state changed. */
  restyle(state: MarkerState): void {
    for (const id of this.visible) this.apply(id, this.markers.get(id)!, state);
  }

  setLang(lang: Lang): void {
    if (lang === this.lang) return;
    this.lang = lang;
    for (const [id, m] of this.markers) m.setTooltipContent(placeName(this.places.get(id)!, lang));
  }

  private apply(id: string, m: L.CircleMarker, s: MarkerState): void {
    const visited = s.visited(id);
    const inTrip = s.inTrip(id);
    const selected = s.selectedId === id;
    const opacity = s.opacity(id);
    const key = `${+visited}${+inTrip}${+selected}${opacity}`;
    if (this.styleKeys.get(id) === key) return;
    this.styleKeys.set(id, key);
    m.setStyle(fullMarkerStyle(this.places.get(id)!, visited, inTrip, selected, opacity));
    if (selected) m.bringToFront();
  }
}
