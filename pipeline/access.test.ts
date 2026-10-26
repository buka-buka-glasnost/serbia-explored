// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyAccess, estimateAccess, isPaved, shouldEstimate, type Road } from './access';

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

describe('estimateAccess', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'access-test-'));
    vi.stubEnv('OSM_CACHE_DIR', dir);
    vi.stubEnv('REFRESH', '');
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await rm(dir, { recursive: true, force: true });
  });

  const lat100m = P.lat + 100 / 111_000;
  const pavedNearP = {
    elements: [{ type: 'way', tags: { highway: 'tertiary' }, geometry: [{ lat: lat100m, lon: 20.99 }, { lat: lat100m, lon: 21.01 }] }],
  };
  const respond = (body: unknown) => vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));

  it('queries only points not in the per-point cache and writes no raw road dumps', async () => {
    const fetchMock = respond(pavedNearP);
    vi.stubGlobal('fetch', fetchMock);
    const first = await estimateAccess([{ id: 'Q1', ...P }]);
    expect(first.get('Q1')).toBe('door');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // same point under another id, plus a far point with no roads
    const empty = respond({ elements: [] });
    vi.stubGlobal('fetch', empty);
    const far = { lat: 43, lon: 20 };
    const second = await estimateAccess([{ id: 'Q2', ...P }, { id: 'Q3', ...far }]);
    expect(second.get('Q2')).toBe('door');
    expect(second.get('Q3')).toBe('hike_boat');
    expect(empty).toHaveBeenCalledTimes(1);
    const body = new URLSearchParams(empty.mock.calls[0][1].body).get('data')!;
    expect(body).toContain('43,20');
    expect(body).not.toContain(`${P.lat},${P.lon}`);
    expect(await readdir(dir)).toEqual(['access-by-point.v1.json']);
  });

  it('adopts the unversioned cache file once, so nothing is refetched', async () => {
    await writeFile(path.join(dir, 'access-by-point.json'), JSON.stringify({ '44.00000,21.00000': 'rough' }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await estimateAccess([{ id: 'Q1', ...P }])).get('Q1')).toBe('rough');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(path.join(dir, 'access-by-point.v1.json'), 'utf8'))).toEqual({ '44.00000,21.00000': 'rough' });
  });

  it('warns about and ignores an unreadable cache file', async () => {
    await writeFile(path.join(dir, 'access-by-point.v1.json'), '{"truncated');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', respond(pavedNearP));
    expect((await estimateAccess([{ id: 'Q1', ...P }])).get('Q1')).toBe('door');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/unreadable cache file/));
    warn.mockRestore();
  });
});
