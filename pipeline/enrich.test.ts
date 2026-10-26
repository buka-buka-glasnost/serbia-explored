// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchExtracts, fetchPhotoInfo, trimExtract } from './enrich';

const fixture = (n: string) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');
const respond = (n: string) => vi.fn().mockImplementation(async () => new Response(fixture(n), { status: 200 }));

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'enrich-test-'));
  vi.stubEnv('WIKI_CACHE_DIR', dir);
  vi.stubEnv('REFRESH', '');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe('fetchExtracts', () => {
  it('maps normalized and redirected titles back to the requested title', async () => {
    const fetchMock = respond('extracts.json');
    vi.stubGlobal('fetch', fetchMock);
    const map = await fetchExtracts(['studenica_monastery', 'Nis Fortress', 'Missing page'], 'en');
    expect(map.get('studenica_monastery')).toMatch(/^Studenica is a monastery/);
    expect(map.get('Nis Fortress')).toMatch(/^The Niš Fortress/);
    expect(map.has('Missing page')).toBe(false);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe('https://en.wikipedia.org');
    expect(url.searchParams.get('titles')).toBe('studenica_monastery|Nis Fortress|Missing page');
    expect(url.searchParams.get('exsentences')).toBe('3');
  });

  it('requests 20 titles per call', async () => {
    const fetchMock = respond('extracts.json');
    vi.stubGlobal('fetch', fetchMock);
    await fetchExtracts(Array.from({ length: 45 }, (_, i) => `T${i}`), 'sr');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain('sr.wikipedia.org');
  });
});

describe('fetchPhotoInfo', () => {
  it('strips HTML from the author and fills the Photo fields', async () => {
    const fetchMock = respond('imageinfo.json');
    vi.stubGlobal('fetch', fetchMock);
    const map = await fetchPhotoInfo(['Studenica_front.jpg', 'No licence.jpg']);
    expect(map.get('Studenica_front.jpg')).toEqual({
      url: 'https://upload.wikimedia.org/thumb/Studenica_front.jpg/640px-Studenica_front.jpg',
      file: 'Studenica_front.jpg',
      author: 'Jane',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Studenica_front.jpg',
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe('https://commons.wikimedia.org');
    expect(url.searchParams.get('iiurlwidth')).toBe('640');
  });

  it('leaves out files without LicenseShortName', async () => {
    vi.stubGlobal('fetch', respond('imageinfo.json'));
    const map = await fetchPhotoInfo(['Studenica_front.jpg', 'No licence.jpg']);
    expect(map.has('No licence.jpg')).toBe(false);
  });
});

describe('fetchPhotoInfo edge cases', () => {
  const files = ['studenica side.jpg', 'Credit only.jpg', 'No author.jpg'];

  it('follows normalized and redirects back to a lowercase-initial requested name', async () => {
    const fetchMock = respond('imageinfo.json');
    vi.stubGlobal('fetch', fetchMock);
    const map = await fetchPhotoInfo(files);
    expect(map.get('studenica side.jpg')?.author).toBe('John');
    expect(map.get('studenica side.jpg')?.file).toBe('studenica side.jpg');
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('redirects')).toBe('1');
  });

  it('falls back to Credit when Artist is blank, and drops the photo when both are blank', async () => {
    vi.stubGlobal('fetch', respond('imageinfo.json'));
    const map = await fetchPhotoInfo(files);
    expect(map.get('Credit only.jpg')?.author).toBe('Own work & edit');
    expect(map.has('No author.jpg')).toBe(false);
  });
});

describe('fetchPhotoInfo output hygiene', () => {
  it('drops display:none duplicates from the author and the utm query from the thumbnail URL', async () => {
    const body = {
      query: {
        pages: {
          '1': {
            title: 'File:Dup.jpg',
            imageinfo: [{
              thumburl: 'https://upload.wikimedia.org/t/Dup.jpg/640px-Dup.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo',
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:Dup.jpg',
              extmetadata: {
                Artist: { value: 'Unknown author<span style="display: none;">Unknown author</span>' },
                LicenseShortName: { value: 'CC BY 4.0' },
              },
            }],
          },
        },
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 })));
    const photo = (await fetchPhotoInfo(['Dup.jpg'])).get('Dup.jpg');
    expect(photo?.author).toBe('Unknown author');
    expect(photo?.url).toBe('https://upload.wikimedia.org/t/Dup.jpg/640px-Dup.jpg');
  });
});

describe('MediaWiki errors returned with HTTP 200', () => {
  it('throws a non-transient API error and does not cache it', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'badvalue', info: 'x' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchExtracts(['A'], 'en')).rejects.toThrow(/badvalue/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', respond('extracts.json'));
    expect((await fetchExtracts(['A'], 'en')).size).toBe(0);
    expect((await fetchExtracts(['studenica_monastery'], 'en')).size).toBe(1);
  });

  it('retries a maxlag error and then succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'maxlag' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(fixture('imageinfo.json'), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = fetchPhotoInfo(['Studenica_front.jpg']);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(5000);
    expect((await p).size).toBe(1);
    vi.useRealTimers();
  });
});

describe('trimExtract', () => {
  it('cuts a long three-sentence text at a sentence end within 450 chars', () => {
    const s = (c: string) => `${c.repeat(199)}.`;
    const out = trimExtract(`${s('a')} ${s('b')} ${s('c')}`);
    expect(out.endsWith('.')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(450);
    expect(out).toBe(`${s('a')} ${s('b')}`.slice(0, out.length));
  });

  it('cuts at a word boundary and adds an ellipsis when no sentence ends', () => {
    const out = trimExtract('word '.repeat(200), 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out).not.toMatch(/wor…$/);
  });

  it('returns short text unchanged', () => {
    expect(trimExtract('Short one.')).toBe('Short one.');
  });
});
