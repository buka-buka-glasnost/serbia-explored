import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const USER_AGENT = 'SerbiaExplored/0.1 (data pipeline)';
const BACKOFF_MS = [5000, 15000, 45000];

export class HttpError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Cache file path: `<cacheBase>-<10 hex of sha1(url + body)>.json`, so a changed request never hits a stale file. */
export function cachePath(cacheBase: string, url: string, init?: RequestInit): string {
  const hash = createHash('sha1')
    .update(url)
    .update('\n')
    .update(typeof init?.body === 'string' ? init.body : '')
    .digest('hex')
    .slice(0, 10);
  return `${cacheBase}-${hash}.json`;
}

/**
 * GET/POST JSON with a User-Agent, retry (5/15/45 s) on 429/5xx/network errors,
 * and a file cache. `cacheBase` is a path without extension (e.g. data/cache/wiki/extracts-en-1).
 * REFRESH=1 bypasses reading the cache. The cache is written only after a successful parse.
 */
export async function fetchJson<T>(url: string, cacheBase: string, init: RequestInit = {}): Promise<T> {
  const file = cachePath(cacheBase, url, init);
  if (process.env.REFRESH !== '1') {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as T;
    } catch {
      /* not cached */
    }
  }

  const headers = { ...(init.headers as Record<string, string> | undefined), 'User-Agent': USER_AGENT };
  let lastError: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1]);
    try {
      const res = await fetch(url, { ...init, headers });
      if (!res.ok) throw new HttpError(res.status, url);
      const json = (await res.json()) as T;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(json));
      return json;
    } catch (e) {
      if (e instanceof HttpError && !e.retryable) throw e;
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('request failed');
}
