import { describe, expect, it } from 'vitest';
import type { AreaFC, Place } from '../src/shared/types';
import { findMissing, looksLikeExcel, normaliseRegisterId, parseRegisterIds, type RegisterEntry } from './reconcile';

const sq: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
const mun = (id: string, nameSr: string): AreaFC['features'][number] => ({
  type: 'Feature', geometry: sq, properties: { id, level: 'municipality', nameSr, inKosovo: false },
});
// ids deliberately unlike the names: matching goes through the area name, not an id convention
const areas: AreaFC = { type: 'FeatureCollection', features: [mun('m-1', 'Краљево'), mun('m-2', 'Нови Пазар')] };

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
  const noIds = new Map<string, Set<string>>();
  it('matches by containment within the same municipality', () => {
    expect(findMissing([entry()], [place('Q1', 'Студеница', 'm-1')], areas, noIds)).toEqual([]);
  });
  it('matches a municipality written with a "Град" prefix', () => {
    expect(findMissing([entry({ municipality: 'Град Краљево' })], [place('Q1', 'Студеница', 'm-1')], areas, noIds)).toEqual([]);
  });
  it('does not match the same name in another municipality', () => {
    const e = entry();
    expect(findMissing([e], [place('Q1', 'Студеница', 'm-2')], areas, noIds)).toEqual([e]);
  });
  it('matches by register id even when the name differs', () => {
    const ids = new Map([['SK1', new Set(['Q1'])]]);
    expect(findMissing([entry({ name: 'Потпуно друго име', municipality: 'Нигде' })],
      [place('Q1', 'Студеница', 'm-1')], areas, ids)).toEqual([]);
  });
  it('matches a register id shared by several items when any of them is a place', () => {
    const ids = new Map([['SK1', new Set(['Q8', 'Q2'])]]);
    expect(findMissing([entry({ municipality: 'Нигде' })], [place('Q2', 'Друго', null)], areas, ids)).toEqual([]);
  });
  it('ignores a register id whose item is not among the places', () => {
    const e = entry();
    expect(findMissing([e], [], areas, new Map([['SK1', new Set(['Q9'])]]))).toEqual([e]);
  });
});

describe('looksLikeExcel', () => {
  it('accepts .xls and .xlsx signatures and rejects HTML', () => {
    expect(looksLikeExcel(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe(true);
    expect(looksLikeExcel(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true);
    expect(looksLikeExcel(new TextEncoder().encode('<!DOCTYPE html><html>'))).toBe(false);
    expect(looksLikeExcel(new Uint8Array([]))).toBe(false);
  });
});
