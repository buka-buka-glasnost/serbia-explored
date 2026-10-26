// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchExtracts, fetchPhotoInfo, stableBatches, stripHtml, trimExtract } from './enrich';

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
    expect(url.searchParams.get('exsentences')).toBe('10');
    const requested = fetchMock.mock.calls.flatMap((c) => new URL(c[0]).searchParams.get('titles')!.split('|'));
    expect(requested).toEqual(['Missing page', 'Nis Fortress', 'studenica_monastery']);
  });

  it('requests at most 20 titles per call, each title once', async () => {
    const fetchMock = respond('extracts.json');
    vi.stubGlobal('fetch', fetchMock);
    const titles = Array.from({ length: 45 }, (_, i) => `T${i}`);
    await fetchExtracts([...titles, 'T3', 'T7'], 'sr');
    const sent = fetchMock.mock.calls.map((c) => new URL(c[0]).searchParams.get('titles')!.split('|'));
    expect(sent.every((b) => b.length <= 20)).toBe(true);
    expect(sent.flat().sort()).toEqual([...titles].sort());
    expect(String(fetchMock.mock.calls[0][0])).toContain('sr.wikipedia.org');
  });

  it('adding one title refetches only the batch it lands in', async () => {
    const titles = Array.from({ length: 60 }, (_, i) => `Title ${i}`);
    const first = respond('extracts.json');
    vi.stubGlobal('fetch', first);
    await fetchExtracts(titles, 'en');
    const second = respond('extracts.json');
    vi.stubGlobal('fetch', second);
    await fetchExtracts([...titles, 'Title 27b'], 'en');
    expect(first.mock.calls.length).toBeGreaterThan(2);
    // its batch, or the two halves when the new title itself ends a batch
    expect(second.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(second.mock.calls.length).toBeLessThanOrEqual(2);
    const sent = second.mock.calls.map((c) => new URL(c[0]).searchParams.get('titles')!);
    expect(sent.some((t) => t.split('|').includes('Title 27b'))).toBe(true);
  });

  it('warns when MediaWiki returns continue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = { continue: { excontinue: '1', continue: '||' }, query: { pages: {} } };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 })));
    await fetchExtracts(['A', 'B'], 'en');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/continue.*A \| B/));
    warn.mockRestore();
  });
});

describe('stableBatches', () => {
  it('sorts, de-duplicates and caps the batch size', () => {
    const items = Array.from({ length: 300 }, (_, i) => `x${i}`);
    const batches = stableBatches([...items, 'x5'], 20);
    expect(batches.flat()).toEqual([...items].sort());
    expect(Math.max(...batches.map((b) => b.length))).toBeLessThanOrEqual(20);
  });
});

describe('stripHtml', () => {
  it('decodes numeric and named entities, &amp; last', () => {
    expect(stripHtml('A&#160;B&nbsp;C &#x110;or&#273;e &lt;i&gt; &#39;q&#039; &amp;lt;')).toBe("A B C Đorđe <i> 'q' &lt;");
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
    const s = (c: string) => `${c.toUpperCase()}${c.repeat(198)}.`;
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

  it('does not treat a date period before a lowercase word as a sentence end', () => {
    const text = `Први пасус је овде. Уписан је од 29. јуна ${'реч '.repeat(200)}`;
    expect(trimExtract(text)).toBe('Први пасус је овде.');
    const full = `Први пасус је овде. Уписан је од 29. јуна 2007. године. Друга реченица${' и дужа'.repeat(60)}.`;
    expect(trimExtract(full)).toBe('Први пасус је овде. Уписан је од 29. јуна 2007. године.');
  });

  it('does not cut after a short abbreviation', () => {
    const text = `Први пасус је овде. Манастир св. Ђорђа је стар${' и леп'.repeat(90)}.`;
    expect(trimExtract(text)).toBe('Први пасус је овде.');
  });

  it('falls back to the ellipsis when only false sentence ends exist', () => {
    const out = trimExtract(`Уписан 29. јуна ${'реч '.repeat(200)}`, 100);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns short text unchanged', () => {
    expect(trimExtract('Short one.')).toBe('Short one.');
  });
});
