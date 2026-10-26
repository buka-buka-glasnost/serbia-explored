import { describe, expect, it } from 'vitest';
import { haversineKm, orderStops } from './order';

describe('haversineKm', () => {
  it('Belgrade to Novi Sad is about 72 km', () => {
    const d = haversineKm({ lat: 44.8176, lon: 20.4633 }, { lat: 45.2671, lon: 19.8335 });
    expect(d).toBeGreaterThan(70);
    expect(d).toBeLessThan(75);
  });
});

describe('orderStops', () => {
  const A = { lat: 44, lon: 20 };
  const B = { lat: 44, lon: 21 };
  const C = { lat: 44, lon: 22 };
  const D = { lat: 44, lon: 23 };

  it('visits points on a line in order from a start to the west', () => {
    const stops = [A, D, B, C]; // shuffled input
    const order = orderStops(stops, { lat: 44, lon: 19 });
    expect(order.map((i) => stops[i])).toEqual([A, B, C, D]);
  });

  it('without a start still gives a line order (either direction)', () => {
    const stops = [C, A, D, B];
    const pts = orderStops(stops).map((i) => stops[i]);
    expect([[A, B, C, D], [D, C, B, A]]).toContainEqual(pts);
  });

  it('always returns a permutation of 0..n-1', () => {
    for (let n = 0; n <= 9; n++) {
      const stops = Array.from({ length: n }, (_, i) => ({ lat: 43 + ((i * 7) % 5) * 0.3, lon: 19 + ((i * 3) % 7) * 0.4 }));
      for (const start of [undefined, { lat: 44, lon: 20 }]) {
        const order = orderStops(stops, start);
        expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
      }
    }
  });
});
