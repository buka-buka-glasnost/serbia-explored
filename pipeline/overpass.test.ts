// @vitest-environment node
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, USER_AGENT } from './http';
import { overpass, validateOverpass } from './overpass';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const ELEMENTS = { elements: [{ type: 'relation', id: 1 }] };

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'overpass-test-'));
  vi.stubEnv('OSM_CACHE_DIR', dir);
  vi.stubEnv('REFRESH', '');
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe('validateOverpass', () => {
  it('rejects an error remark as retryable', () => {
    const v = validateOverpass('k');
    try {
      v({ elements: [], remark: 'runtime error: Query timed out in "query" at line 1' });
      throw new Error('no throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).retryable).toBe(true);
    }
  });
  it('rejects empty elements as non-retryable, naming the cache key', () => {
    try {
      validateOverpass('serbia-level-8')({ elements: [] });
      throw new Error('no throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).retryable).toBe(false);
      expect((e as Error).message).toMatch(/serbia-level-8/);
    }
  });
  it('accepts empty elements when allowed, and normal results', () => {
    expect(() => validateOverpass('roads', true)({ elements: [] })).not.toThrow();
    expect(() => validateOverpass('k')(ELEMENTS)).not.toThrow();
  });
});

describe('overpass', () => {
  it('POSTs the query with the shared User-Agent and caches under the key plus a request hash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(ELEMENTS));
    vi.stubGlobal('fetch', fetchMock);
    expect(await overpass('[out:json];rel(1);out;', 'outline')).toEqual(ELEMENTS);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://overpass-api.de/api/interpreter');
    expect(init.method).toBe('POST');
    expect(init.headers['User-Agent']).toBe(USER_AGENT);
    expect(new URLSearchParams(init.body).get('data')).toBe('[out:json];rel(1);out;');
    expect(await readdir(dir)).toEqual([expect.stringMatching(/^outline-[0-9a-f]{10}\.json$/)]);
    // second call is served from the cache
    expect(await overpass('[out:json];rel(1);out;', 'outline')).toEqual(ELEMENTS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries after an error remark with the 10 s Overpass back-off', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ elements: [], remark: 'runtime error: out of memory' }))
      .mockResolvedValueOnce(json(ELEMENTS));
    vi.stubGlobal('fetch', fetchMock);
    const p = overpass('q', 'remark');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // not the 5 s default
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toEqual(ELEMENTS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails without retrying or caching on an empty result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ elements: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(overpass('q', 'empty-areas')).rejects.toThrow(/no elements for empty-areas/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it('writes no cache file when the key is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ elements: [] })));
    expect(await overpass('q', null, { allowEmpty: true })).toEqual({ elements: [] });
    expect(await readdir(dir)).toEqual([]);
  });
});
