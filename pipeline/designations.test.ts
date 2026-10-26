import { describe, it, expect } from 'vitest';
import {
  DESIGNATION_BY_QID,
  TIER_BY_DESIGNATION,
  tierFor,
} from './designations';

describe('tierFor', () => {
  it('returns the minimum tier across designations', () => {
    expect(tierFor(['heritage_great', 'unesco_whs_part'])).toBe(1);
    expect(tierFor(['ramsar'])).toBe(3);
    expect(tierFor(['national_park', 'heritage_protected'])).toBe(2);
  });

  it('throws on an empty list', () => {
    expect(() => tierFor([])).toThrow();
  });
});

describe('designation tables', () => {
  it('maps every designation from DESIGNATION_BY_QID to a tier', () => {
    for (const designation of Object.values(DESIGNATION_BY_QID)) {
      expect(TIER_BY_DESIGNATION).toHaveProperty(designation);
    }
  });

  it('does not map Q6906963', () => {
    expect(Object.keys(DESIGNATION_BY_QID)).not.toContain('Q6906963');
  });
});
