import { describe, expect, it } from 'vitest';
import type { Place } from '../shared/types';
import { markerStyle } from './markerStyle';

const mk = (tier: Place['tier']) => ({ tier }) as Place;

describe('markerStyle', () => {
  it('styles an unvisited tier 1 place', () => {
    expect(markerStyle(mk(1), false, false)).toEqual({ radius: 9, fillColor: '#c0392b', color: '#ffffff', weight: 2 });
  });
  it('scales radius and colour by tier', () => {
    expect(markerStyle(mk(2), false, false)).toMatchObject({ radius: 7, fillColor: '#e67e22' });
    expect(markerStyle(mk(3), false, false)).toMatchObject({ radius: 5, fillColor: '#138d75' });
    expect(markerStyle(mk(4), false, false)).toMatchObject({ radius: 4, fillColor: '#7f8c8d' });
  });
  it('visited keeps the tier fill and adds a green ring', () => {
    expect(markerStyle(mk(3), true, false)).toMatchObject({ fillColor: '#138d75', color: '#1e8449', weight: 3, radius: 6 });
  });
  it('trip keeps the tier fill, adds a dark dashed ring and wins over visited', () => {
    expect(markerStyle(mk(1), true, true)).toMatchObject({ fillColor: '#c0392b', color: '#1d2125', dashArray: '3 2' });
  });
});
