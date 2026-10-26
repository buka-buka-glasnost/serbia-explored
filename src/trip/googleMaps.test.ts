import { describe, expect, it } from 'vitest';
import { buildDirectionsUrl, routeStops } from './googleMaps';

const stops = [
  { lat: 44.1, lon: 20.1 },
  { lat: 44.2, lon: 20.2 },
  { lat: 44.3, lon: 20.3 },
];

describe('buildDirectionsUrl', () => {
  it('uses the last stop as destination and the rest as waypoints, no origin', () => {
    const u = new URL(buildDirectionsUrl(stops));
    expect(u.searchParams.get('destination')).toBe('44.300000,20.300000');
    expect(u.searchParams.get('waypoints')!.split('|')).toHaveLength(2);
    expect(u.searchParams.has('origin')).toBe(false);
    expect(u.searchParams.get('travelmode')).toBe('driving');
    expect(buildDirectionsUrl(stops)).toContain('waypoints=44.100000,20.100000%7C44.200000,20.200000');
  });

  it('adds origin when given', () => {
    const u = buildDirectionsUrl(stops, { lat: 43.5, lon: 21 });
    expect(u).toContain('origin=43.500000,21.000000');
  });

  it('omits waypoints for a single stop', () => {
    expect(buildDirectionsUrl([stops[0]])).not.toContain('waypoints');
  });
});

describe('routeStops', () => {
  const list = [{ id: 'a' }, { id: 'b' }];
  it('drops the start place from the stops', () => {
    expect(routeStops(list, 'a')).toEqual([{ id: 'b' }]);
  });
  it('keeps everything without a start or with an unrelated one', () => {
    expect(routeStops(list, null)).toEqual(list);
    expect(routeStops(list, 'z')).toEqual(list);
  });
  it('is empty when the only stop is the start', () => {
    expect(routeStops([{ id: 'a' }], 'a')).toEqual([]);
  });
});
