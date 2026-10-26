type Ring = GeoJSON.Position[];
type Shape = GeoJSON.Polygon | GeoJSON.MultiPolygon;

const WORLD: Ring = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];

const rings = (g: Shape): Ring[] => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat());

/**
 * A world-sized polygon with the shape cut out as holes, so filling it shades
 * everything outside. Enclaves inside the shape become filled again (even-odd).
 */
export function worldMask(shape: Shape): GeoJSON.Feature<GeoJSON.Polygon> {
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [WORLD, ...rings(shape)] } };
}
