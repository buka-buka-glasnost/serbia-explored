import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Photo, PlacesFile } from '../src/shared/types';
import { estimateAccess, shouldEstimate } from './access';
import { fetchAreas } from './areas';
import { assemblePlaces, displayName, type DroppedPlace } from './assemble';
import { checkPlaces } from './checks';
import { DESIGNATION_BY_QID, NATURE_CLASS_BY_QID } from './designations';
import { fetchExtracts, fetchPhotoInfo } from './enrich';
import { groupRows, mergeRaw, type RawPlace } from './normalize';
import type { Overrides } from './overrides';
import { designatedItemsQuery, natureClassQuery } from './queries';
import { reconcile, type ReconcileResult } from './reconcile';
import { runSparql } from './sparql';

const OUT_DIR = path.join('public', 'data');
const REPORT = path.join('data', 'reports', 'dropped.csv');

async function fetchRaw(): Promise<RawPlace[]> {
  let all: RawPlace[] = [];
  // One query per code: the Wikidata Query Service times out on big unions.
  for (const qid of Object.keys(DESIGNATION_BY_QID)) {
    console.log(`SPARQL designation ${qid} (${DESIGNATION_BY_QID[qid]})`);
    const rows = await runSparql(designatedItemsQuery([qid]), `designated-${qid}`);
    all = mergeRaw(all, groupRows(rows, (r) => DESIGNATION_BY_QID[r.code] ?? null));
  }
  for (const qid of Object.keys(NATURE_CLASS_BY_QID)) {
    console.log(`SPARQL nature class ${qid} (${NATURE_CLASS_BY_QID[qid]})`);
    const rows = await runSparql(natureClassQuery([qid]), `nature-class-${qid}`);
    all = mergeRaw(all, groupRows(rows, (r) => NATURE_CLASS_BY_QID[r.code] ?? null));
  }
  return all;
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function count<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

async function size(file: string): Promise<string> {
  return `${((await stat(file)).size / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  const raw = await fetchRaw();
  console.log(`Raw items: ${raw.length}`);
  const noName = raw.filter((r) => !r.nameSr && !r.nameSrLatn && !r.nameEn);

  console.log('Fetching areas');
  const { areas, kosovo } = await fetchAreas();
  const allowlist = JSON.parse(
    await readFile(path.join('pipeline', 'data', 'kosovo-nature-allowlist.json'), 'utf8'),
  ) as string[];
  const overrides = JSON.parse(await readFile(path.join('data', 'overrides.json'), 'utf8')) as Overrides;
  const base = {
    raw, areas, kosovo, kosovoNatureAllowlist: allowlist, overrides,
  };

  // First pass decides which places survive, so enrichment only fetches what is used.
  const empty = new Map<string, never>();
  const first = assemblePlaces({ ...base, extractsSr: empty, extractsEn: empty, photos: empty });
  const kept = new Set(first.places.map((p) => p.id));
  const survivors = raw.filter((r) => kept.has(r.id));

  const titles = (k: 'wikipediaSr' | 'wikipediaEn') =>
    [...new Set(survivors.map((r) => r[k]).filter((t): t is string => !!t))];
  console.log('Fetching Serbian extracts');
  const extractsSr = await fetchExtracts(titles('wikipediaSr'), 'sr');
  console.log('Fetching English extracts');
  const extractsEn = await fetchExtracts(titles('wikipediaEn'), 'en');
  console.log('Fetching photo info');
  const files = [...new Set(survivors.map((r) => r.imageFile).filter((f): f is string => !!f))];
  const photos: Map<string, Photo> = await fetchPhotoInfo(files);
  console.log('Estimating access from road data');
  const accessEstimates = await estimateAccess(
    first.places.filter((p) => shouldEstimate(p.designations)).map((p) => ({ id: p.id, lat: p.lat, lon: p.lon })),
  );

  const { places, dropped } = assemblePlaces({ ...base, extractsSr, extractsEn, photos, accessEstimates });

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(path.dirname(REPORT), { recursive: true });
  const file: PlacesFile = { generatedAt: new Date().toISOString(), places };
  await writeFile(path.join(OUT_DIR, 'places.json'), JSON.stringify(file));
  await writeFile(path.join(OUT_DIR, 'areas.geojson'), JSON.stringify(areas));
  await writeFile(path.join(OUT_DIR, 'kosovo.geojson'), JSON.stringify(kosovo));
  const sortedDropped: DroppedPlace[] = [...dropped].sort(
    (a, b) => a.reason.localeCompare(b.reason) || a.id.localeCompare(b.id, 'en', { numeric: true }),
  );
  await writeFile(
    REPORT,
    ['id,name,reason', ...sortedDropped.map((d) => [d.id, d.name, d.reason].map(csvCell).join(','))].join('\n') + '\n',
  );

  let reconciled: ReconcileResult | null = null;
  if (!process.argv.includes('--skip-reconcile')) {
    console.log('Reconciling against the official register');
    reconciled = await reconcile(places, path.join('data', 'reports', 'missing-from-map.csv'));
  }

  console.log('\n=== Summary ===');
  console.log(`Places: ${places.length}   Dropped: ${dropped.length}`);
  console.log('Per tier:');
  for (const [k, v] of count(places, (p) => `tier ${p.tier}`)) console.log(`  ${k}: ${v}`);
  console.log('Per designation:');
  for (const [k, v] of count(places.flatMap((p) => p.designations.map((d) => ({ d }))), (x) => x.d)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('Per drop reason:');
  for (const [k, v] of count(dropped, (d) => d.reason)) console.log(`  ${k}: ${v}`);
  console.log(`In Kosovo: ${places.filter((p) => p.inKosovo).length}`);
  console.log(`With photo: ${places.filter((p) => p.photo).length}   descSr: ${places.filter((p) => p.descSr).length}   descEn: ${places.filter((p) => p.descEn).length}`);
  if (noName.length > 0) {
    console.log(`Items with no name at all (QID used as name): ${noName.map((r) => `${r.id}(${displayName(r)})`).join(', ')}`);
  }
  if (reconciled) {
    console.log(
      `Register (exceptional+great): ${reconciled.total} entries, matched by id ${reconciled.byId}, ` +
      `by name ${reconciled.byName}, missing ${reconciled.missing.length}`,
    );
  }
  const problems = checkPlaces(places, areas);
  console.log(`Checks: ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  ! ${p}`);
  console.log('File sizes:');
  for (const f of ['places.json', 'areas.geojson', 'kosovo.geojson']) {
    console.log(`  ${f}: ${await size(path.join(OUT_DIR, f))}`);
  }
  if (problems.length > 0 && !process.argv.includes('--allow-warnings')) {
    console.error('Data checks failed (use --allow-warnings to accept).');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
