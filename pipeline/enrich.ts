import path from 'node:path';
import type { Photo } from '../src/shared/types';
import { fetchJson } from './http';

const EXTRACT_BATCH = 20;
const PHOTO_BATCH = 50;
const PAUSE_MS = 200;

function cacheDir(): string {
  return process.env.WIKI_CACHE_DIR ?? path.join('data', 'cache', 'wiki');
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface FromTo { from: string; to: string }
interface QueryResult<P> {
  query?: { normalized?: FromTo[]; redirects?: FromTo[]; pages?: Record<string, P> };
}

/** Follow `normalized` then `redirects` from a requested title to the final page title. */
function resolveTitle(requested: string, q: NonNullable<QueryResult<unknown>['query']>): string {
  let title = requested;
  for (const list of [q.normalized, q.redirects]) {
    const hit = list?.find((x) => x.from === title);
    if (hit) title = hit.to;
  }
  return title;
}

export async function fetchExtracts(titles: string[], lang: 'sr' | 'en'): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const batches = chunks(titles, EXTRACT_BATCH);
  for (const [i, batch] of batches.entries()) {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'extracts',
      exintro: '1',
      explaintext: '1',
      exsentences: '3',
      redirects: '1',
      format: 'json',
      titles: batch.join('|'),
    });
    const json = await fetchJson<QueryResult<{ title: string; extract?: string }>>(
      `https://${lang}.wikipedia.org/w/api.php?${params}`,
      path.join(cacheDir(), `extracts-${lang}-${i + 1}`),
    );
    const q = json.query;
    if (!q?.pages) continue;
    const byTitle = new Map(Object.values(q.pages).map((p) => [p.title, p.extract]));
    for (const requested of batch) {
      const extract = byTitle.get(resolveTitle(requested, q))?.trim();
      if (extract) result.set(requested, extract);
    }
    if (i < batches.length - 1) await sleep(PAUSE_MS);
  }
  return result;
}

interface ImagePage {
  title: string;
  imageinfo?: {
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
}

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const canonicalFile = (s: string) => s.replace(/^File:/i, '').replace(/_/g, ' ').trim();

export async function fetchPhotoInfo(files: string[]): Promise<Map<string, Photo>> {
  const result = new Map<string, Photo>();
  const batches = chunks(files, PHOTO_BATCH);
  for (const [i, batch] of batches.entries()) {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'extmetadata|url',
      iiurlwidth: '640',
      format: 'json',
      titles: batch.map((f) => `File:${canonicalFile(f)}`).join('|'),
    });
    const json = await fetchJson<QueryResult<ImagePage>>(
      `https://commons.wikimedia.org/w/api.php?${params}`,
      path.join(cacheDir(), `photos-${i + 1}`),
    );
    const pages = Object.values(json.query?.pages ?? {});
    for (const file of batch) {
      const info = pages.find((p) => canonicalFile(p.title) === canonicalFile(file))?.imageinfo?.[0];
      const license = info?.extmetadata?.LicenseShortName?.value;
      if (!info?.thumburl || !info.descriptionurl || !license) continue;
      result.set(file, {
        url: info.thumburl,
        file,
        author: stripHtml(info.extmetadata?.Artist?.value ?? ''),
        license: stripHtml(license),
        sourceUrl: info.descriptionurl,
      });
    }
    if (i < batches.length - 1) await sleep(PAUSE_MS);
  }
  return result;
}

/** Cut at the last sentence end within maxChars; otherwise at a word boundary with an ellipsis. */
export function trimExtract(text: string, maxChars = 450): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const window = t.slice(0, maxChars);
  let end = -1;
  for (const m of window.matchAll(/[.!?]["”»)]*(?=\s|$)/g)) end = m.index + m[0].length;
  if (end > 0) return window.slice(0, end);
  const room = t.slice(0, maxChars - 1);
  const space = room.lastIndexOf(' ');
  return `${(space > 0 ? room.slice(0, space) : room).replace(/[\s,;:]+$/, '')}…`;
}
