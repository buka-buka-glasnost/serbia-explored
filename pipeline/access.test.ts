import { describe, expect, it } from 'vitest';
import { classifyAccess, isPaved, shouldEstimate, type Road } from './access';

// ~0.0009° latitude ≈ 100 m; roads run east–west at a given latitude offset from the place
const P = { lat: 44, lon: 21 };
const road = (metresNorth: number, paved: boolean): Road => {
  const lat = P.lat + metresNorth / 111_000;
  return { paved, coords: [[20.99, lat], [21.01, lat]] };
};

describe('isPaved', () => {
  it('reads the surface tag', () => {
    expect(isPaved({ highway: 'tertiary', surface: 'asphalt' })).toBe(true);
    expect(isPaved({ highway: 'tertiary', surface: 'gravel' })).toBe(false);
  });
  it('treats untagged tracks as unpaved unless graded solid, other untagged roads as paved', () => {
    expect(isPaved({ highway: 'track' })).toBe(false);
    expect(isPaved({ highway: 'track', tracktype: 'grade1' })).toBe(true);
    expect(isPaved({ highway: 'residential' })).toBe(true);
  });
});

describe('classifyAccess', () => {
  it('paved road within 150 m → door', () => {
    expect(classifyAccess(P, [road(100, true)])).toBe('door');
  });
  it('closer unpaved road within 300 m → rough', () => {
    expect(classifyAccess(P, [road(80, false), road(250, true)])).toBe('rough');
  });
  it('only a paved road between 150 and 300 m → door', () => {
    expect(classifyAccess(P, [road(250, true)])).toBe('door');
  });
  it('nothing drivable within 300 m → hike/boat', () => {
    expect(classifyAccess(P, [road(600, true)])).toBe('hike_boat');
    expect(classifyAccess(P, [])).toBe('hike_boat');
  });
});

describe('shouldEstimate', () => {
  it('skips large protected areas', () => {
    expect(shouldEstimate(['national_park'])).toBe(false);
    expect(shouldEstimate(['ramsar'])).toBe(false);
    expect(shouldEstimate(['heritage_exceptional'])).toBe(true);
    expect(shouldEstimate(['nature_other'])).toBe(true);
  });
});
