import path from 'node:path';
import { fetchJson } from './http';

export type SparqlRow = Record<string, string>;

const ENDPOINT = 'https://query.wikidata.org/sparql';

function cacheDir(): string {
  return process.env.SPARQL_CACHE_DIR ?? path.join('data', 'cache', 'sparql');
}

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

export async function runSparql(query: string, cacheKey: string): Promise<SparqlRow[]> {
  const json = await fetchJson<{ results: { bindings: Record<string, Binding>[] } }>(
    ENDPOINT,
    path.join(cacheDir(), cacheKey),
    {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ query }).toString(),
    },
  );
  return toRows(json);
}
