import L from 'leaflet';

/**
 * A circle marker drawn as a rhomb, the shape of the Pirot kilim motif. It keeps the circle
 * marker's radius, styling and tap area; only the drawing and the redraw bounds change.
 * Canvas only (the map uses `preferCanvas`).
 */

/** Half-diagonal of the rhomb per unit of radius: a rhomb of the same "radius" looks smaller, so it is drawn a bit larger. */
const SIZE = 1.3;

interface CanvasRenderer extends L.Canvas {
  _drawing: boolean;
  _ctx: CanvasRenderingContext2D;
  _fillStroke(ctx: CanvasRenderingContext2D, layer: L.Path): void;
}
interface Internals {
  _point: L.Point;
  _radius: number;
  _renderer: CanvasRenderer;
  _pxBounds: L.Bounds;
  _empty(): boolean;
  _clickTolerance(): number;
}

export const RhombMarker = L.CircleMarker.extend({
  _updateBounds(this: Internals) {
    const r = this._radius * SIZE + this._clickTolerance();
    this._pxBounds = new L.Bounds(this._point.subtract([r, r]), this._point.add([r, r]));
  },
  _updatePath(this: Internals & L.Path) {
    const renderer = this._renderer;
    if (!renderer._drawing || this._empty()) return;
    const { x, y } = this._point;
    const s = Math.max(Math.round(this._radius * SIZE), 1);
    const ctx = renderer._ctx;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
    renderer._fillStroke(ctx, this);
  },
}) as unknown as new (latlng: L.LatLngExpression, options?: L.CircleMarkerOptions) => L.CircleMarker;

declare module 'leaflet' {
  function rhombMarker(latlng: L.LatLngExpression, options?: L.CircleMarkerOptions): L.CircleMarker;
}

// The Leaflet plugin convention: a lower-case factory on the L namespace.
(L as unknown as { rhombMarker: typeof L.rhombMarker }).rhombMarker = (latlng, options) => new RhombMarker(latlng, options);
