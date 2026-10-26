import { describe, expect, it } from 'vitest';
import type { Place } from '../src/shared/types';
import { findMissing, normaliseRegisterId, parseRegisterIds, type RegisterEntry } from './reconcile';

const place = (id: string, nameSr: string, municipalityId: string | null): Place => ({
  id, nameSr, kind: 'culture', tier: 1, designations: [], lat: 44, lon: 20,
  districtId: null, municipalityId, inKosovo: false, access: null,
} satisfies Place);

const entry = (over: Partial<RegisterEntry> = {}): RegisterEntry => ({
  registerId: 'СК 1', name: 'Манастир Студеница', municipality: 'Краљево', category: 'exceptional', type: 'SK', ...over,
});

describe('register ids', () => {
  it('normalises Excel and Wikidata forms to the same key', () => {
    expect(normaliseRegisterId('СК 2277')).toBe('SK2277');
    expect(normaliseRegisterId(' СК  4')).toBe('SK4');
    expect(normaliseRegisterId('ПКИЦ16')).toBe('PKIC16');
    expect(normaliseRegisterId('АН 204')).toBe('AN204');
  });
  it('extracts several ids from one cell', () => {
    expect(parseRegisterIds('СК 1403, 1404; ЗМ 42СК 396')).toEqual(['SK1403', 'SK1404', 'ZM42', 'SK396']);
    expect(parseRegisterIds('СК ')).toEqual([]);
  });
});

describe('findMissing', () => {
  const noIds = new Map<string, string>();
  it('matches by containment within the same municipality', () => {
    expect(findMissing([entry()], [place('Q1', 'Студеница', 'm-kraljevo')], noIds)).toEqual([]);
  });
  it('does not match the same name in another municipality', () => {
    const e = entry();
    expect(findMissing([e], [place('Q1', 'Студеница', 'm-novi-pazar')], noIds)).toEqual([e]);
  });
  it('never reports uncategorised entries', () => {
    expect(findMissing([entry({ category: 'none' })], [], noIds)).toEqual([]);
  });
  it('matches by register id even when the name differs', () => {
    const ids = new Map([['SK1', 'Q1']]);
    expect(findMissing([entry({ name: 'Потпуно друго име', municipality: 'Нигде' })],
      [place('Q1', 'Студеница', 'm-kraljevo')], ids)).toEqual([]);
  });
  it('ignores a register id whose item is not among the places', () => {
    const e = entry();
    expect(findMissing([e], [], new Map([['SK1', 'Q9']]))).toEqual([e]);
  });
});
