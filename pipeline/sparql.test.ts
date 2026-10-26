// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSparql } from './sparql';

const body = {
  results: {
    bindings: [
      {
        item: { type: 'uri', value: 'http://www.wikidata.org/entity/Q1' },
        labelEn: { type: 'literal', value: 'Thing', 'xml:lang': 'en' },
      },
    ],
  },
};
const ok = () => new Response(JSON.stringify(body), { status: 200 });

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'sparql-test-'));
  vi.stubEnv('SPARQL_CACHE_DIR', dir);
  vi.stubEnv('REFRESH', '');
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe('runSparql', () => {
  it('returns the cached file without calling fetch', async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'k.json'), JSON.stringify([{ item: 'Q9' }]));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await runSparql('SELECT 1', 'k')).toEqual([{ item: 'Q9' }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches with the right headers, reduces URIs to QIDs and writes the cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    const rows = await runSparql('SELECT 1', 'fresh');
    expect(rows).toEqual([{ item: 'Q1', labelEn: 'Thing' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://query.wikidata.org/sparql');
    expect(init.method).toBe('POST');
    expect(init.headers.Accept).toBe('application/sparql-results+json');
    expect(init.headers['User-Agent']).toBe('SerbiaExplored/0.1 (data pipeline)');
    expect(JSON.parse(await readFile(path.join(dir, 'fresh.json'), 'utf8'))).toEqual(rows);
  });

  it('REFRESH=1 ignores the cache', async () => {
    await writeFile(path.join(dir, 'r.json'), JSON.stringify([{ item: 'Q9' }]));
    vi.stubEnv('REFRESH', '1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()));
    expect(await runSparql('SELECT 1', 'r')).toEqual([{ item: 'Q1', labelEn: 'Thing' }]);
  });

  it('retries once after a 429 (5 s back-off) then resolves', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    const p = runSparql('SELECT 1', 'retry');
    // The cache lookup uses real file I/O, so wait for the first request.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toEqual([{ item: 'Q1', labelEn: 'Thing' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after 3 retries (5 s, 15 s, 45 s) on persistent 5xx', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => new Response('x', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = runSparql('SELECT 1', 'fail');
    const settled = expect(p).rejects.toThrow(/503/);
    for (const [n, wait] of [[1, 5000], [2, 15000], [3, 45000]] as const) {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(n));
      await vi.advanceTimersByTimeAsync(wait);
    }
    await settled;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry on a 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(runSparql('bad', 'bad')).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
