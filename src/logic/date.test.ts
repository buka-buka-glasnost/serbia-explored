import { describe, it, expect } from 'vitest';
import { todayLocal } from './date';

describe('todayLocal', () => {
  it('uses local time, not UTC', () => {
    expect(todayLocal(new Date(2026, 9, 27, 0, 30))).toBe('2026-10-27');
  });
  it('pads month and day', () => {
    expect(todayLocal(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});
