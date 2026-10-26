import path from 'node:path';
import { ApiError, fetchJson } from './http';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
/** The public Overpass server asks for patience: longer waits than the default backoff. */
const BACKOFF_MS = [10_000, 30_000, 60_000, 90_000];
/** Queries run with [timeout:180]; allow for the server time plus the download. */
const TIMEOUT_MS = 240_000;

export interface OverpassJson { elements: unknown[]; remark?: string }

function cacheDir(): string {
  return process.env.OSM_CACHE_DIR ?? path.join('data', 'cache', 'osm');
}

/**
 * Rejects a 200 response Overpass uses to report a runtime error (a `remark`, retried),
 * and, unless `allowEmpty`, an empty result, which for the area queries means a broken query
 * or an overloaded server truncating output (not retried, so the run stops instead of caching it).
 */
export function validateOverpass(label: string, allowEmpty = false): (json: OverpassJson) => void {
  return (json) => {
    if (json.remark && /error|timed out/i.test(json.remark)) {
      throw new ApiError(`Overpass remark for ${label}: ${json.remark}`, true);
    }
    if (!Array.isArray(json.elements)) throw new ApiError(`Overpass response for ${label} has no elements`, true);
    if (json.elements.length === 0 && !allowEmpty) {
      throw new ApiError(`Overpass returned no elements for ${label}`, false);
    }
  };
}

/**
 * Run an Overpass query. `cacheKey` names the cache file (the request hash is appended);
 * null skips the response cache. `allowEmpty` accepts an empty result (e.g. no roads nearby).
 */
export async function overpass(
  query: string, cacheKey: string | null, opts: { allowEmpty?: boolean } = {},
): Promise<OverpassJson> {
  return fetchJson<OverpassJson>(
    ENDPOINT,
    cacheKey === null ? null : path.join(cacheDir(), cacheKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }).toString(),
    },
    validateOverpass(cacheKey ?? 'uncached query', opts.allowEmpty),
    { backoffMs: BACKOFF_MS, timeoutMs: TIMEOUT_MS },
  );
}
