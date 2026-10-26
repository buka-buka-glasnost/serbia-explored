import { describe, expect, it } from 'vitest';
import { canFit } from './canFit';

describe('canFit', () => {
  it('is false while the container has no size', () => {
    expect(canFit({ x: 0, y: 0 })).toBe(false);
    expect(canFit({ x: 300, y: 0 })).toBe(false);
    expect(canFit({ x: 0, y: 300 })).toBe(false);
  });
  it('is true once it has a size', () => {
    expect(canFit({ x: 375, y: 812 })).toBe(true);
  });
});
