import { describe, expect, it } from 'vitest';
import { worldMask } from './worldMask';

const square: GeoJSON.Position[] = [[20, 44], [21, 44], [21, 45], [20, 45], [20, 44]];
const enclave: GeoJSON.Position[] = [[20.4, 44.4], [20.5, 44.4], [20.5, 44.5], [20.4, 44.4]];

describe('worldMask', () => {
  it('puts the world first and the shape (with its enclaves) as holes', () => {
    const m = worldMask({ type: 'Polygon', coordinates: [square, enclave] });
    expect(m.geometry.coordinates).toHaveLength(3);
    expect(m.geometry.coordinates[0][0]).toEqual([-180, -85]);
    expect(m.geometry.coordinates[1]).toBe(square);
    expect(m.geometry.coordinates[2]).toBe(enclave);
  });

  it('flattens multipolygons into holes', () => {
    const m = worldMask({ type: 'MultiPolygon', coordinates: [[square], [enclave]] });
    expect(m.geometry.coordinates).toHaveLength(3);
  });
});
