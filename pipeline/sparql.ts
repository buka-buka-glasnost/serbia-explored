import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type SparqlRow = Record<string, string>;

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'SerbiaExplored/0.1 (data pipeline)';
const BACKOFF_MS = [5000, 15000, 45000];

function cacheDir(): string {
  return process.env.SPARQL_CACHE_DIR ?? path.join('data', 'cache', 'sparql');
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Binding { type: string; value: string }

// Reduce entity URIs to QIDs; everything else stays as-is.
function reduce(b: Binding): string {
  if (b.type === 'uri') {
    const m = /^https?:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/.exec(b.value);
    if (m) return m[1];
  }
  return b.value;
}

function toRows(json: { results: { bindings: Record<string, Binding>[] } }): SparqlRow[] {
  return json.results.bindings.map((b) => {
    const row: SparqlRow = {};
    for (const [k, v] of Object.entries(b)) row[k] = reduce(v);
    return row;
  });
}

async function readCache(file: string): Promise<SparqlRow[] | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as SparqlRow[];
  } catch {
    return null;
  }
}

export async function runSparql(query: string, cacheKey: string): Promise<SparqlRow[]> {
  const file = path.join(cacheDir(), `${cacheKey}.json`);
  if (process.env.REFRESH !== '1') {
    const cached = await readCache(file);
    if (cached) return cached;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1]);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ query }).toString(),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`SPARQL HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}`);
      const rows = toRows(await res.json());
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(rows));
      return rows;
    } catch (e) {
      if (e instanceof Error && /^SPARQL HTTP 4/.test(e.message)) throw e;
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('SPARQL request failed');
}
