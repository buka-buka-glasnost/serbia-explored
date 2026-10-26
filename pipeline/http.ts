import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Wikimedia's User-Agent policy asks for a contact URL; every pipeline request uses this. */
export const USER_AGENT =
  'SerbiaExplored/0.1 (https://github.com/buka-buka-glasnost/serbia-explored; data pipeline)';
const DEFAULT_BACKOFF_MS = [5000, 15000, 45000];
const DEFAULT_TIMEOUT_MS = 60_000;

export class HttpError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/** Thrown by a `validate` callback to reject a 200 response; `retryable` decides whether to back off and retry. */
export class ApiError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = 'ApiError';
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Write via a temp file and rename, so an interrupted run never leaves a half-written file. */
export async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

/**
 * Read and parse a JSON cache file. A missing file returns undefined silently;
 * a file that exists but does not parse is reported and treated as missing.
 */
export async function readJsonCache<T>(file: string): Promise<T | undefined> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    console.warn(`Ignoring unreadable cache file ${file}: ${(e as Error).message}`);
    return undefined;
  }
}

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

export interface FetchOptions {
  /** Waits before each retry; the number of entries is the number of retries. Default 5/15/45 s. */
  backoffMs?: number[];
  /** Per-attempt timeout; a timeout is retried. Default 60 s. */
  timeoutMs?: number;
}

/**
 * GET/POST JSON with a User-Agent, a per-attempt timeout, retry on 429/5xx/network errors/timeouts,
 * and a file cache. `cacheBase` is a path without extension (e.g. data/cache/wiki/extracts-en), or null
 * for no cache. REFRESH=1 bypasses reading the cache. The cache is written only after a successful
 * parse and `validate` (which throws to reject).
 */
export async function fetchJson<T>(url: string, cacheBase: string | null, init: RequestInit = {},
  validate?: (json: T) => void, opts: FetchOptions = {},
): Promise<T> {
  const file = cacheBase === null ? null : cachePath(cacheBase, url, init);
  if (file && process.env.REFRESH !== '1') {
    const cached = await readJsonCache<T>(file);
    if (cached !== undefined) return cached;
  }

  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const headers = { ...(init.headers as Record<string, string> | undefined), 'User-Agent': USER_AGENT };
  let lastError: unknown;
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    if (attempt > 0) await sleep(backoff[attempt - 1]);
    try {
      const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const res = await fetch(url, { ...init, headers, signal });
      if (!res.ok) throw new HttpError(res.status, url);
      const json = (await res.json()) as T;
      validate?.(json);
      if (file) await writeFileAtomic(file, JSON.stringify(json));
      return json;
    } catch (e) {
      if ((e instanceof HttpError || e instanceof ApiError) && !e.retryable) throw e;
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('request failed');
}
