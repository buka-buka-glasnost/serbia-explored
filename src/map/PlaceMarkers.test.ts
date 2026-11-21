import { describe, expect, it } from 'vitest';
import type { Place } from '../shared/types';
import { markerStyle } from './markerStyle';

const mk = (tier: Place['tier']) => ({ tier }) as Place;

describe('markerStyle', () => {
  it('styles an unvisited tier 1 place', () => {
    expect(markerStyle(mk(1), false, false)).toEqual({ radius: 9, fillColor: '#c6363c', color: '#ffffff', weight: 2 });
  });
  it('scales radius and colour by tier', () => {
    expect(markerStyle(mk(2), false, false)).toMatchObject({ radius: 7, fillColor: '#b07f1c' });
    expect(markerStyle(mk(3), false, false)).toMatchObject({ radius: 5, fillColor: '#3f78b5' });
    expect(markerStyle(mk(4), false, false)).toMatchObject({ radius: 4, fillColor: '#8a9099' });
  });
  it('visited keeps the tier fill and adds a green ring', () => {
    expect(markerStyle(mk(3), true, false)).toMatchObject({ fillColor: '#3f78b5', color: '#25744a', weight: 3, radius: 6 });
  });
  it('trip keeps the tier fill, adds a dark dashed ring and wins over visited', () => {
    expect(markerStyle(mk(1), true, true)).toMatchObject({ fillColor: '#c6363c', color: '#18202e', dashArray: '3 2' });
  });
});
