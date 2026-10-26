# Serbia Explored Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web app that maps every important cultural and natural place in Serbia by tier, lets each visitor mark places visited (date, note, photos), browse by district/municipality, and send a trip of up to 9 stops to Google Maps.

**Architecture:** Two halves in one repo. A Node/TypeScript **data pipeline** (`pipeline/`, run by hand with `npm run data`) pulls Wikidata, Wikipedia, Wikimedia Commons and OpenStreetMap, assigns tiers and areas, applies a hand-edited overrides file, and writes static files to `public/data/`. A **React app** (`src/`) loads those files, renders a Leaflet map, and keeps all personal data in IndexedDB with JSON export/import. No server; deployable to any static host.

**Tech Stack:** Node 24, TypeScript, Vite, React 18, Leaflet + react-leaflet + leaflet.markercluster, zustand, idb, @turf/turf, Vitest + @testing-library/react + fake-indexeddb + jsdom, tsx (pipeline runner), SheetJS `xlsx` (from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`).

**Spec:** `docs/superpowers/specs/2026-10-26-serbia-explored-design.md`

## Global Constraints

- Static hosting only — no server-side code. The app must not call Wikidata or any data API at runtime (map tiles and Google Maps links excepted).
- Serbian text is stored in **Cyrillic**; Latin is generated with `toLatin()`. Never transliterate Latin → Cyrillic.
- Languages: `sr-Cyrl` (Ћирилица), `sr-Latn` (Latinica), `en` (English).
- Missing English description → show the Serbian text (Latin) with the note "Not translated yet — shown in Serbian." No machine translation.
- Tiers: 1 World-class, 2 Nationally outstanding, 3 Significant, 4 Other protected. A place takes its **highest** (lowest-numbered) tier. Tier 4 hidden by default.
- Kosovo: included and shown by default; purple overlay `#8a6fa5`, fill opacity 0.18, dashed border; "Show Kosovo" switch top-right of the map with the note on hover (tap ⓘ on touch). Kosovo places use **Serbia's administrative scheme**. English mode shows Kosovo names as `Serbian (Latin) / Albanian`. Nothing from Kosovo's own heritage register (`Q6906963`) or Kosovo-only protected areas.
- Kosovo note (English, verbatim): "Kosovo's status is disputed. Serbia considers it part of its territory under UN Security Council Resolution 1244. Kosovo declared independence in 2008 and is recognised by many, but not all, countries. Several Serbian heritage sites there are on UNESCO's World Heritage list."
- Access info values: `door` ("Drive to the door"), `rough` ("Rough road"), `hike_boat` ("Hike / boat only"), or `null` → "Information not available yet".
- Trip: max **9** stops. Google Maps directions URL, `travelmode=driving`.
- One visit record per place: date (`YYYY-MM-DD`, local), note, up to **5** photos, each resized to max **1600 px** long side, JPEG quality **0.8**.
- Export/import must exist from the first release; the app never deletes visit data without an explicit confirmation.
- Wikimedia Commons photos always show author and licence.
- Desktop: list + map (left panel, map right, place card bottom-right). Below 768 px wide: map-first, card as bottom sheet, list in a drawer.

## Review Focus

- **Search across scripts and spellings:** "djavolja", "Đavolja", "Ђавоља" and "DAVOLJA" must all find Đavolja Varoš → tests in Task 8 (`matchesQuery`).
- **Visiting just after midnight:** the default visit date is the local date in the browser, not the UTC date (`toISOString()` gives yesterday's date between 00:00 and 01:00/02:00 in Serbia) → test in Task 9 (`todayLocal`).
- **Importing a backup:** a backup with visits for places no longer in the data keeps those visits; a non-backup JSON or a newer `version` is rejected without touching existing data → tests in Task 9.
- **Storage unavailable or full:** in private windows or when the quota is hit, the map still loads and a save failure shows a message instead of crashing; a failed photo save does not lose the visit → tests in Task 9 and Task 11.
- **Trip edge cases:** adding a 10th stop is refused with a message, adding the same place twice is a no-op, and trip stops in Kosovo stay in the trip when Kosovo is hidden → tests in Task 13.

---

## File structure

```
package.json, tsconfig.json, vite.config.ts, index.html
.gitignore                      # + data/cache/
src/shared/types.ts             # Place, Area, Designation, Tier, Lang… (used by pipeline AND app)
src/shared/translit.ts          # toLatin, hasCyrillic, foldForSearch
pipeline/designations.ts        # QID → Designation, Designation → Tier, tierFor
pipeline/sparql.ts              # runSparql with cache + retry
pipeline/queries.ts             # SPARQL query builders
pipeline/normalize.ts           # SPARQL rows → RawPlace[]
pipeline/areas.ts               # boundaries fetch, Serbian-scheme Kosovo, point → area
pipeline/data/kosovo-serbian-scheme.json   # Kosovo municipality (OSM) → Serbian municipality/district
pipeline/data/kosovo-nature-allowlist.json # nature QIDs allowed inside Kosovo (Šar planina NP)
pipeline/enrich.ts              # Wikipedia extracts, Commons photo attribution
pipeline/overrides.ts           # apply data/overrides.json
pipeline/assemble.ts            # pure: raw + areas + enrichment + overrides → Place[]
pipeline/reconcile.ts           # official Excel lists vs Place[] → missing report
pipeline/build-data.ts          # CLI orchestrator (npm run data)
pipeline/__fixtures__/          # recorded SPARQL/API responses for tests
data/overrides.json             # hand-edited
data/reports/                   # generated reports (committed)
public/data/places.json, areas.geojson, kosovo.geojson   # generated (committed)
src/data/loadData.ts
src/i18n/strings.ts, src/i18n/i18n.ts
src/logic/search.ts, filters.ts, progress.ts, date.ts
src/storage/db.ts, photos.ts, backup.ts
src/state/store.ts
src/trip/order.ts, googleMaps.ts
src/map/tiles.ts, MapView.tsx, PlaceMarkers.tsx, KosovoLayer.tsx, KosovoToggle.tsx, AreaLayer.tsx
src/ui/App.tsx, SidePanel.tsx, ProgressSummary.tsx, Filters.tsx, PlaceList.tsx, PlaceCard.tsx,
       VisitEditor.tsx, AreaPicker.tsx, TripPanel.tsx, LanguageSwitch.tsx, BackupControls.tsx, Toast.tsx
src/ui/app.css
.github/workflows/deploy.yml
README.md
```

Tests sit next to their source as `*.test.ts(x)`.

---

### Task 1: Project scaffold, shared types, transliteration

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/shared/types.ts`, `src/shared/translit.ts`
- Modify: `.gitignore` (add `data/cache/`)
- Test: `src/shared/translit.test.ts`

**Interfaces:**
- Produces (`src/shared/types.ts`):
  ```ts
  export type Lang = 'sr-Cyrl' | 'sr-Latn' | 'en';
  export type Tier = 1 | 2 | 3 | 4;
  export type PlaceKind = 'culture' | 'nature';
  export type Access = 'door' | 'rough' | 'hike_boat';
  export type Designation =
    | 'unesco_whs' | 'unesco_whs_part' | 'unesco_geopark' | 'unesco_biosphere'
    | 'heritage_exceptional' | 'national_park' | 'unesco_tentative'
    | 'heritage_great' | 'special_nature_reserve' | 'ramsar'
    | 'heritage_protected' | 'nature_other';
  export interface LatLon { lat: number; lon: number }
  export interface Photo { url: string; file: string; author: string; license: string; sourceUrl: string }
  export interface Place {
    id: string;                 // Wikidata QID, or "x-<slug>" for manual places
    nameSr: string;             // Cyrillic where available, else as found
    nameEn?: string; nameSq?: string;
    typeSr?: string; typeEn?: string;
    kind: PlaceKind; tier: Tier; designations: Designation[];
    partOf?: { id: string; nameSr: string; nameEn?: string };
    lat: number; lon: number;
    districtId: string | null; municipalityId: string | null; inKosovo: boolean;
    photo?: Photo; descSr?: string; descEn?: string;
    access: Access | null;
    wikipediaSr?: string; wikipediaEn?: string;
  }
  export interface AreaProps {
    id: string; level: 'district' | 'municipality';
    nameSr: string; nameSq?: string; nameEn?: string;
    districtId?: string; inKosovo: boolean;
  }
  export interface PlacesFile { generatedAt: string; places: Place[] }
  export type AreaFC = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProps>;
  ```
- Produces (`src/shared/translit.ts`): `toLatin(text: string): string`, `hasCyrillic(text: string): boolean`, `foldForSearch(text: string): string`.

- [ ] **Step 1: Scaffold** with `npm create vite@latest . -- --template react-ts`, then install: `leaflet react-leaflet leaflet.markercluster zustand idb @turf/turf` and dev deps `vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb tsx @types/leaflet @types/leaflet.markercluster` and `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Scripts: `dev`, `build`, `preview`, `test` (`vitest run`), `data` (`tsx pipeline/build-data.ts`). Vitest environment `jsdom`, setup file imports `@testing-library/jest-dom` and `fake-indexeddb/auto`.

- [ ] **Step 2: Write the failing test** `src/shared/translit.test.ts`:
  ```ts
  expect(toLatin('Ђавоља Варош')).toBe('Đavolja Varoš');
  expect(toLatin('Љубовија Њеш Џеп')).toBe('Ljubovija Nješ Džep');
  expect(toLatin('ЉУБОВИЈА')).toBe('LJUBOVIJA');         // all-caps word → LJ
  expect(toLatin('Манастир Студеница')).toBe('Manastir Studenica');
  expect(toLatin('Studenica 1190')).toBe('Studenica 1190'); // non-Cyrillic untouched
  expect(hasCyrillic('Peć')).toBe(false); expect(hasCyrillic('Пећ')).toBe(true);
  expect(foldForSearch('Đavolja')).toBe('djavolja');
  expect(foldForSearch('Ђавоља')).toBe('djavolja');
  expect(foldForSearch('ČAČAK žić ć')).toBe('cacak zic c');
  ```

- [ ] **Step 3: Run** `npx vitest run src/shared/translit.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement** the three functions. `toLatin`: letter table (а→a … ђ→đ, ж→ž, љ→lj, њ→nj, џ→dž, ћ→ć, ч→č, ш→š); capital digraphs give `Lj/Nj/Dž`, or `LJ/NJ/DŽ` when the next letter is also upper-case. `foldForSearch`: `toLatin`, lower-case, `đ→dj`, then strip diacritics with NFD + remove `\p{M}`.

- [ ] **Step 5: Run** the test — Expected: PASS. Also `npm run build` succeeds.

- [ ] **Step 6: Commit** `feat: scaffold app, shared types and transliteration`.

---

### Task 2: Designations and tier rules

**Files:**
- Create: `pipeline/designations.ts`
- Test: `pipeline/designations.test.ts`

**Interfaces:**
- Consumes: `Designation`, `Tier` from Task 1.
- Produces:
  ```ts
  export const DESIGNATION_BY_QID: Record<string, Designation>;
  export const NATURE_CLASS_BY_QID: Record<string, Designation>; // filled in Task 3
  export const TIER_BY_DESIGNATION: Record<Designation, Tier>;
  export const NATURE_DESIGNATIONS: ReadonlySet<Designation>;
  export function tierFor(ds: Designation[]): Tier;   // min tier; throws on empty
  ```

QID values (verified 2026-10-26):

| QID | Designation |
|-----|-------------|
| Q9259 | unesco_whs |
| Q43113623 | unesco_whs_part |
| Q1459900 | unesco_tentative |
| Q19683138 | ramsar |
| Q3323436, Q32459, Q5773555, Q15455839 | heritage_exceptional |
| Q3323432, Q3485475, Q17097806, Q5773549 | heritage_great |
| Q3323469, Q3485476, Q139254645, Q139257193 | heritage_protected |

Tiers: `unesco_whs, unesco_whs_part, unesco_geopark, unesco_biosphere` → 1; `heritage_exceptional, national_park, unesco_tentative` → 2; `heritage_great, special_nature_reserve, ramsar` → 3; `heritage_protected, nature_other` → 4. `NATURE_DESIGNATIONS` = `unesco_geopark, unesco_biosphere, national_park, special_nature_reserve, ramsar, nature_other`.

- [ ] **Step 1: Write the failing test:** `tierFor(['heritage_great','unesco_whs_part'])` → 1; `tierFor(['ramsar'])` → 3; `tierFor(['national_park','heritage_protected'])` → 2; `tierFor([])` throws; every value of `DESIGNATION_BY_QID` is a key of `TIER_BY_DESIGNATION`; `Q6906963` is **not** a key of `DESIGNATION_BY_QID`.
- [ ] **Step 2: Run** `npx vitest run pipeline/designations.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `pipeline/designations.ts` with the table above (`NATURE_CLASS_BY_QID` starts empty).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(pipeline): designations and tier rules`.

---

### Task 3: Wikidata fetch and normalisation

**Files:**
- Create: `pipeline/sparql.ts`, `pipeline/queries.ts`, `pipeline/normalize.ts`, `pipeline/__fixtures__/designated-rows.json`, `pipeline/__fixtures__/nature-rows.json`
- Modify: `pipeline/designations.ts` (fill `NATURE_CLASS_BY_QID`)
- Test: `pipeline/normalize.test.ts`, `pipeline/sparql.test.ts`

**Interfaces:**
- Consumes: Task 2 tables.
- Produces:
  ```ts
  export type SparqlRow = Record<string, string>;  // binding name → value (URIs reduced to QIDs)
  export function runSparql(query: string, cacheKey: string): Promise<SparqlRow[]>;
  export function designatedItemsQuery(designationQids: string[]): string;
  export function natureClassQuery(classQids: string[]): string;
  export interface RawPlace {
    id: string; nameSr?: string; nameSrLatn?: string; nameEn?: string; nameSq?: string;
    typeSr?: string; typeEn?: string;
    designations: Designation[]; partOfIds: string[];
    coord: LatLon | null; imageFile?: string;
    wikipediaSr?: string; wikipediaEn?: string;
  }
  export function groupRows(rows: SparqlRow[], classify: (row: SparqlRow) => Designation | null): RawPlace[];
  export function mergeRaw(a: RawPlace[], b: RawPlace[]): RawPlace[];   // union by id, designations unioned
  ```

Query columns (both builders): `?item ?code ?coord ?image ?labelSr ?labelSrEl ?labelEn ?labelSq ?typeSr ?typeEn ?partOf ?srwiki ?enwiki`, where `?code` is the P1435 value (designated) or the P31 class (nature). Filter `?item wdt:P17 ?country. VALUES ?country { wd:Q403 wd:Q1246 }`. `?partOf` = `P361` target. Labels via explicit `rdfs:label` with `FILTER(LANG()=…)` for `sr`, `sr-el`, `en`, `sq` (not the label service, so missing labels stay empty).

`runSparql`: POST to `https://query.wikidata.org/sparql` with `Accept: application/sparql-results+json` and `User-Agent: SerbiaExplored/0.1 (data pipeline)`; cache JSON at `data/cache/sparql/<cacheKey>.json` and reuse it if present unless `REFRESH=1`; retry 3 times with 5 s, 15 s, 45 s back-off on 429/5xx/network errors.

- [ ] **Step 1: Discover nature classes.** Run an ad-hoc SPARQL (Wikidata Query Service in a browser is fine) counting `P31` classes of items in Serbia that are protected areas (`?item wdt:P31/wdt:P279* wd:Q473972`). Record QIDs for: national park (`Q46169`), the Serbian "special nature reserve", natural monument, nature park, landscape of outstanding features, UNESCO Global Geopark, biosphere reserve. Map them in `NATURE_CLASS_BY_QID` (geopark → `unesco_geopark`, biosphere → `unesco_biosphere`, national park → `national_park`, special nature reserve → `special_nature_reserve`, the rest → `nature_other`). Put the counts in the commit message.
- [ ] **Step 2: Record fixtures:** save trimmed real responses (about 15 rows each) covering Studenica (WHS), Đurđevi stupovi (part of WHS, `partOf` Stari Ras and Sopoćani), a Kosovo monastery with `country = Q1246`, an item with two coordinates, an item with a Latin-only `sr` label, and Tara National Park.
- [ ] **Step 3: Write the failing tests:** `groupRows` on the fixture returns one RawPlace per QID; the two-coordinate item gets the first coordinate; designations are de-duplicated; `partOfIds` for Đurđevi stupovi contains the Stari Ras and Sopoćani QID; an item whose only code isn't classified is dropped; `coord` parses `Point(20.5 43.3)` as `{lat: 43.3, lon: 20.5}`. In `sparql.test.ts`, with `fetch` mocked: a cached file short-circuits fetch; a 429 then a 200 resolves after one retry (fake timers).
- [ ] **Step 4: Run** `npx vitest run pipeline` — Expected: FAIL.
- [ ] **Step 5: Implement** the three modules.
- [ ] **Step 6: Run** — Expected: PASS.
- [ ] **Step 7: Commit** `feat(pipeline): wikidata queries and normalisation`.

---

### Task 4: Boundaries and area assignment (Serbian scheme including Kosovo)

**Files:**
- Create: `pipeline/areas.ts`, `pipeline/data/kosovo-serbian-scheme.json`, `pipeline/__fixtures__/mini-areas.geojson`
- Test: `pipeline/areas.test.ts`

**Interfaces:**
- Consumes: `AreaProps`, `LatLon`.
- Produces:
  ```ts
  // AreaFC comes from src/shared/types.ts (Task 1)
  export function fetchAreas(): Promise<{ areas: AreaFC; kosovo: GeoJSON.Feature<GeoJSON.MultiPolygon | GeoJSON.Polygon> }>;
  export function buildKosovoSerbianScheme(kosovoMunicipalities: AreaFC, scheme: KosovoScheme): AreaFC;
  export function assignArea(p: LatLon, areas: AreaFC): { districtId: string | null; municipalityId: string | null };
  export function isInKosovo(p: LatLon, kosovo: GeoJSON.Feature): boolean;
  export interface KosovoScheme {
    districts: { id: string; nameSr: string; nameSq: string }[];
    municipalities: { id: string; nameSr: string; nameSq: string; districtId: string; osmNames: string[] }[];
  }
  ```

Rules:
- Outside Kosovo: districts and municipalities/cities from OSM via Overpass (`https://overpass-api.de/api/interpreter`), inside the Serbia relation but outside the Kosovo relation. **Verify the admin levels by count before relying on them:** expect 25 district-level units outside Kosovo (24 districts + City of Belgrade) and roughly 145 municipality/city units. Cache raw responses under `data/cache/osm/`. IDs: `d-<slug>` and `m-<slug>` from the Latin name.
- Kosovo: `kosovo-serbian-scheme.json` lists Serbia's 5 districts — Kosovski (`d-kosovski`), Pećki (`d-pecki`), Prizrenski (`d-prizrenski`), Kosovsko-Mitrovački (`d-kosovsko-mitrovacki`), Kosovsko-Pomoravski (`d-kosovsko-pomoravski`) — and Serbia's municipalities there: Kosovski: Priština, Kosovo Polje, Obilić, Lipljan, Glogovac, Podujevo, Kačanik, Uroševac, Štimlje, Štrpce; Pećki: Peć, Istok, Klina, Dečani, Đakovica; Prizrenski: Prizren, Orahovac, Suva Reka, Gora; Kosovsko-Mitrovački: Kosovska Mitrovica, Zvečan, Zubin Potok, Leposavić, Srbica, Vučitrn; Kosovsko-Pomoravski: Gnjilane, Vitina, Kosovska Kamenica, Novo Brdo. `nameSr` is in Cyrillic. Each Serbian municipality's polygon is the union of the OSM (Kosovo-scheme) municipalities named in `osmNames`. A post-2000 Kosovo municipality that was carved from several Serbian ones (e.g. Mališevo, Gračanica, Junik, Mamuša, Elez Han, Klokot, Parteš, Ranilug, Dragaš) is mapped whole to the Serbian municipality holding most of its area. This is an accepted approximation; record it in the file's `"note"` field. District polygons are the union of their municipalities.
- Simplify all polygons (`turf.simplify`, tolerance 0.001, highQuality) so `areas.geojson` stays under 3 MB.
- `assignArea`: municipality containing the point, and its district; a point on no polygon (border rounding) gets the nearest municipality within 2 km, else nulls.

- [ ] **Step 1: Write the failing tests** using `mini-areas.geojson` (two square municipalities in one district plus one Kosovo-scheme square): a point inside square A → `{districtId:'d-test', municipalityId:'m-a'}`; a point 500 m outside A → A; a point 50 km away → nulls; `buildKosovoSerbianScheme` merges two OSM squares listed under one Serbian municipality into one feature with `inKosovo: true`. Validate the real `kosovo-serbian-scheme.json`: 5 districts, 29 municipalities, every municipality's `districtId` exists, and no `osmNames` entry appears twice.
- [ ] **Step 2: Run** `npx vitest run pipeline/areas.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `areas.ts` and fill `osmNames` in the scheme file from the live OSM municipality names.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(pipeline): boundaries with Serbian scheme for Kosovo`.

---

### Task 5: Descriptions and photo attribution

**Files:**
- Create: `pipeline/enrich.ts`, `pipeline/__fixtures__/extracts.json`, `pipeline/__fixtures__/imageinfo.json`
- Test: `pipeline/enrich.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function fetchExtracts(titles: string[], lang: 'sr' | 'en'): Promise<Map<string, string>>;
  export function fetchPhotoInfo(files: string[]): Promise<Map<string, Photo>>;
  export function trimExtract(text: string, maxChars?: number): string;  // default 450
  ```

- Extracts: `https://{lang}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=3&redirects=1&format=json&titles=…`, 20 titles per request, cached under `data/cache/wiki/`. Map keyed by the **requested** title (follow `normalized` and `redirects`).
- Photos: Commons `action=query&prop=imageinfo&iiprop=extmetadata|url&iiurlwidth=640`, 50 files per request. `author` = `Artist` with HTML stripped, `license` = `LicenseShortName`, `url` = `thumburl`, `sourceUrl` = `descriptionurl`. Files with no licence metadata are left out (no photo shown).
- `trimExtract`: cut at the last sentence end before `maxChars`; if there's no sentence end, cut at a word boundary and add `…`.
- Both use the same User-Agent and retry policy as `runSparql` (move it into a shared `pipeline/http.ts` helper `fetchJson(url, cacheFile, init?)`).

- [ ] **Step 1: Write the failing tests:** a redirected title maps back to the requested title; HTML in `Artist` (`<a href=…>Jane</a>`) becomes `Jane`; a file without `LicenseShortName` is missing from the map; `trimExtract` on a 600-char, three-sentence text ends in `.` and is ≤ 450 chars.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(pipeline): wikipedia extracts and commons attribution`.

---

### Task 6: Assembly, overrides and the `npm run data` command

**Files:**
- Create: `pipeline/overrides.ts`, `pipeline/assemble.ts`, `pipeline/build-data.ts`, `pipeline/data/kosovo-nature-allowlist.json`, `data/overrides.json`
- Test: `pipeline/assemble.test.ts`, `pipeline/overrides.test.ts`
- Generated (committed): `public/data/places.json`, `public/data/areas.geojson`, `public/data/kosovo.geojson`, `data/reports/dropped.csv`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  ```ts
  export interface Overrides {
    places: Record<string, Partial<Omit<Place, 'id'>>>;   // patch by id
    added: Place[];                                      // manual places (id "x-<slug>")
    removed: string[];                                   // ids to drop
  }
  export function applyOverrides(places: Place[], o: Overrides): Place[];
  export interface DroppedPlace { id: string; name: string; reason: 'no_coordinates' | 'outside_serbia' | 'kosovo_nature_not_serbian' | 'whs_composite' | 'removed_by_override' }
  export function assemblePlaces(input: {
    raw: RawPlace[]; areas: AreaFC; kosovo: GeoJSON.Feature;
    extractsSr: Map<string, string>; extractsEn: Map<string, string>;
    photos: Map<string, Photo>; kosovoNatureAllowlist: string[]; overrides: Overrides;
  }): { places: Place[]; dropped: DroppedPlace[] };
  ```

Rules in `assemblePlaces`, in this order:
1. Drop items with no coordinate (`no_coordinates`).
2. Any item whose `partOfIds` includes a `unesco_whs` item gains `unesco_whs_part`, and `partOf` is set from that item.
3. A `unesco_whs` item that some other raw item lists in `partOfIds` is dropped (`whs_composite`), so composites like "Medieval Monuments in Kosovo" don't add a duplicate pin.
4. `inKosovo` = `isInKosovo(coord)`. An item in Kosovo whose designations are all nature designations and whose id isn't in `kosovo-nature-allowlist.json` is dropped (`kosovo_nature_not_serbian`). The allowlist holds the Šar planina National Park QID (look it up in Task 3's discovery).
5. Area: `assignArea`; if both are null **and** the point is outside Serbia+Kosovo → drop (`outside_serbia`).
6. `kind` = `nature` if every designation is a nature designation, else `culture`. `tier` = `tierFor`.
7. Names: `nameSr` = `labelSr` if it has Cyrillic, else `labelSrEl`, else `labelSr`, else `labelEn`. `nameSq` only when `inKosovo`.
8. `descSr`/`descEn` from extracts via `trimExtract`; `photo` from `photos`; `access: null`.
9. `applyOverrides` last (`removed` → `removed_by_override`).
10. Sort by tier, then `nameSr`.

`build-data.ts` runs the whole chain, writes the three public files (`places.json` as `PlacesFile`, minified) and `dropped.csv`, then prints counts per tier, per designation and per drop reason.

- [ ] **Step 1: Write the failing tests** with small hand-built inputs: an item without a coordinate is dropped as `no_coordinates`; a part of a WHS gets tier 1 and `partOf`; its composite is dropped as `whs_composite`; a stand-alone WHS (Gamzigrad-like) is kept; a Kosovo national park not on the allowlist is dropped and the allowlisted one is kept; a Kosovo monastery with `heritage_exceptional` is kept with `inKosovo: true` and `nameSq`; a Latin-only `sr` label is used when no Cyrillic one exists; `applyOverrides` patches `access: 'hike_boat'`, appends an `added` place and drops a `removed` id; overriding a nonexistent id throws with that id in the message (catches typos).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `overrides.ts`, `assemble.ts`, `build-data.ts`. Seed `data/overrides.json` with `{ "places": {}, "added": [], "removed": [] }`.
- [ ] **Step 4: Run** unit tests — Expected: PASS.
- [ ] **Step 5: Live run** `npm run data`. Expected: tier 1 count between 10 and 30; `heritage_exceptional` between 190 and 230; `heritage_great` between 560 and 650; dropped `no_coordinates` under 5% of the total; `places.json` under 2 MB; `areas.geojson` under 3 MB. If the counts are outside these ranges, investigate before committing.
- [ ] **Step 6: Commit** the code plus generated files: `feat(pipeline): assemble places and generate data`.

---

### Task 7: Reconciliation report against the official register

**Files:**
- Create: `pipeline/reconcile.ts`
- Modify: `pipeline/build-data.ts` (add a reconcile step; `--skip-reconcile` flag)
- Test: `pipeline/reconcile.test.ts`
- Generated (committed): `data/reports/missing-from-map.csv`

**Interfaces:**
- Produces:
  ```ts
  export interface RegisterEntry { registerId: string; name: string; municipality: string; category: 'exceptional' | 'great' | 'none'; type: 'SK' | 'PKIC' | 'AN' | 'ZM' }
  export function readRegisterXls(path: string, type: RegisterEntry['type']): RegisterEntry[];
  export function findMissing(entries: RegisterEntry[], places: Place[]): RegisterEntry[];
  ```

- Download `SK.xls`, `PKIC.xls`, `AN.xls`, `ZM.xls`, `Kategorisani_izuz.xls` and `Kategorisani_veliki.xls` from `https://www.heritage.gov.rs/cirilica/Download/` into `data/cache/excel/` (only if not cached). Inspect one file first to find the header row and the columns for ID, name, municipality and category, and record the column mapping as constants.
- Matching: by register ID if Wikidata exposes one (check for a Serbian heritage-register ID property during Task 3 discovery). Otherwise by `foldForSearch(name)` equality within the same municipality (compare folded municipality names), then by containment.
- The report lists unmatched entries in the exceptional and great categories only (columns: registerId, name, municipality, category, type).

- [ ] **Step 1: Write the failing tests:** an entry "Манастир Студеница" in Kraljevo matches a place `nameSr: 'Студеница'` in municipality Kraljevo; the same name in a different municipality does not match; an uncategorised entry is never reported.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests (PASS), then `npm run data`. Expected: `missing-from-map.csv` exists; the printed missing count is shown. Any count is acceptable, but more than 150 suggests a matching bug — check a sample first.
- [ ] **Step 5: Commit** `feat(pipeline): reconcile against official register`.

---

### Task 8: App data loading, i18n, search, filters, progress

**Files:**
- Create: `src/data/loadData.ts`, `src/i18n/strings.ts`, `src/i18n/i18n.ts`, `src/logic/search.ts`, `src/logic/filters.ts`, `src/logic/progress.ts`
- Test: `src/i18n/i18n.test.ts`, `src/logic/search.test.ts`, `src/logic/filters.test.ts`, `src/logic/progress.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // loadData.ts
  export function loadPlaces(): Promise<Place[]>;                 // fetch `${import.meta.env.BASE_URL}data/places.json`
  export function loadAreas(): Promise<AreaFC>;
  export function loadKosovoOutline(): Promise<GeoJSON.Feature>;
  // strings.ts
  export type StringKey = keyof typeof STRINGS;
  export const STRINGS: Record<string, { sr: string; en: string }>;   // sr in Cyrillic
  // i18n.ts
  export function t(key: StringKey, lang: Lang): string;
  export function placeName(p: Place, lang: Lang): string;
  export function placeDescription(p: Place, lang: Lang): { text: string; untranslated: boolean } | null;
  export function areaName(a: AreaProps, lang: Lang): string;
  export function detectLang(navigatorLanguage: string | undefined): Lang;  // 'sr*' → 'sr-Cyrl', else 'en'
  // search.ts
  export function matchesQuery(p: Place, query: string): boolean;
  // filters.ts
  export interface Settings { lang: Lang; kosovoShown: boolean; tiers: Tier[]; kinds: PlaceKind[] }
  export const DEFAULT_SETTINGS: Omit<Settings, 'lang'>;   // kosovoShown true, tiers [1,2,3], kinds both
  export function filterPlaces(places: Place[], s: Settings, query: string): Place[];
  export function splitByArea(places: Place[], area: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProps>, nearbyKm?: number): { inside: Place[]; nearby: Place[] }; // default 10
  // progress.ts
  export interface Count { visited: number; total: number }
  export function computeProgress(places: Place[], visitedIds: Set<string>, kosovoShown: boolean): { overall: Count; byTier: Record<Tier, Count> };
  ```

Rules:
- `placeName`: `sr-Cyrl` → `nameSr`; `sr-Latn` → `toLatin(nameSr)`; `en` → `nameEn ?? toLatin(nameSr)`, and for `inKosovo` places `${toLatin(nameSr)} / ${nameSq}` when `nameSq` exists and differs after `foldForSearch`. `areaName` follows the same rules.
- `placeDescription`: `en` → `descEn` (untranslated false), else `toLatin(descSr)` (untranslated true); `sr-*` → `descSr` (transliterated for Latn); null if neither exists.
- `matchesQuery`: `foldForSearch(query)` is a substring of the folded `nameSr`, `nameEn`, `nameSq` or `typeSr`; an empty query matches everything.
- `computeProgress`: `overall` counts tiers 1–3 only. `byTier` covers all four. Both exclude `inKosovo` places when `kosovoShown` is false.
- `filterPlaces`: by tier, kind, Kosovo and query.
- `STRINGS` keys referenced by other tasks (use exactly these names): `tripFull`, `alreadyInTrip`, `storageError`, `storageUnavailableBanner`, `tooManyPhotos`, `importDone`, `importInvalid`, `kosovoNote`, `notTranslated`, `accessUnknown`, `accessDoor`, `accessRough`, `accessHikeBoat`.
- `STRINGS` must include at least: app title "Србија — истражено" / "Serbia Explored", visited counter, mark visited, unmark, add to trip, remove from trip, open in Google Maps, trip full, already in trip, show Kosovo, Kosovo note (the English text from Global Constraints plus its Serbian translation: "Статус Косова је спорен. Србија га сматра делом своје територије у складу са Резолуцијом 1244 Савета безбедности УН. Косово је 2008. прогласило независност коју признају многе, али не све државе. Неколико српских споменика културе на Косову налази се на Унесковој листи светске баштине."), the four access labels, the not-translated note ("Not translated yet — shown in Serbian." / "Још није преведено."), tier names, culture/nature, search placeholder, area picker, export, import, import confirmation, storage error, photo attribution.

- [ ] **Step 1: Write the failing tests:**
  - `placeName` for a Kosovo place `{nameSr:'Пећка патријаршија', nameSq:'Patrikana e Pejës', inKosovo:true}` in `en` → `'Pećka patrijaršija / Patrikana e Pejës'`. For a non-Kosovo place with `nameEn` → `nameEn`.
  - `placeDescription` in `en` with only `descSr` → `{ text: <Latin>, untranslated: true }`.
  - `matchesQuery` for Đavolja Varoš (`nameSr: 'Ђавоља варош'`) is true for `djavolja`, `Đavolja`, `Ђавоља` and `DAVOLJA`, and false for `studenica`.
  - `computeProgress` with 2 tier-1 places (1 visited), 1 tier-4 place (visited) and 1 Kosovo tier-2 place: `overall` = `{1,3}` with Kosovo shown and `{1,2}` with it hidden; `byTier[4]` = `{1,1}`.
  - `splitByArea` with a 1°×1° square: a point inside → inside; a point 5 km outside → nearby; a point 30 km outside → neither.
  - Every `StringKey` has non-empty `sr` and `en`.
- [ ] **Step 2: Run** `npx vitest run src/i18n src/logic` — Expected: FAIL.
- [ ] **Step 3: Implement.** `splitByArea` uses `turf.booleanPointInPolygon` and `turf.pointToPolygonDistance` (in km).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): data loading, i18n, search, filters, progress`.

---

### Task 9: Personal storage — visits, photos, backup

**Files:**
- Create: `src/storage/db.ts`, `src/storage/photos.ts`, `src/storage/backup.ts`, `src/logic/date.ts`
- Test: `src/storage/db.test.ts`, `src/storage/backup.test.ts`, `src/logic/date.test.ts`, `src/storage/photos.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // date.ts
  export function todayLocal(now?: Date): string;   // 'YYYY-MM-DD' in local time
  // db.ts — IndexedDB "serbia-explored" v1; stores: visits (key placeId), photos (key id), meta (key string)
  export interface Visit { placeId: string; date: string; note: string; photoIds: string[] }
  export interface StoredPhoto { id: string; placeId: string; blob: Blob; createdAt: string }
  export interface TripState { stopIds: string[]; startPlaceId: string | null }   // null = Google uses current location
  export function getAllVisits(): Promise<Visit[]>;
  export function putVisit(v: Visit): Promise<void>;
  export function deleteVisit(placeId: string): Promise<void>;          // also deletes its photos
  export function putPhoto(p: StoredPhoto): Promise<void>;
  export function getPhoto(id: string): Promise<StoredPhoto | undefined>;
  export function deletePhoto(id: string): Promise<void>;
  export function getMeta<T>(key: 'trip' | 'settings'): Promise<T | undefined>;
  export function setMeta<T>(key: 'trip' | 'settings', value: T): Promise<void>;
  export function requestPersistence(): Promise<boolean>;               // navigator.storage.persist, false if unsupported
  export class StorageUnavailableError extends Error {}
  // photos.ts
  export const MAX_PHOTOS_PER_VISIT = 5;
  export function resizeImage(file: Blob, maxDim?: number, quality?: number): Promise<Blob>; // 1600, 0.8, image/jpeg
  // backup.ts
  export function exportBackup(): Promise<Blob>;     // JSON, filename chosen by caller
  export function backupFileName(now?: Date): string; // 'serbia-explored-backup-YYYY-MM-DD.json'
  export interface ImportResult { visitsImported: number; photosImported: number; tripImported: boolean }
  export function importBackup(file: Blob): Promise<ImportResult>;
  export class BackupFormatError extends Error {}
  ```

Backup JSON: `{ format: 'serbia-explored-backup', version: 1, exportedAt, visits: Visit[], photos: {id, placeId, createdAt, type, dataBase64}[], trip: TripState | null, settings: Settings | null }`.
Import **merges**: a backup visit replaces the current visit for the same `placeId` (its photos are added; photos of the replaced visit that aren't in the backup are deleted). Visits for unknown place ids are kept. Nothing else is deleted. If `format` doesn't match, `version > 1`, or the JSON doesn't parse → `BackupFormatError` with **no** writes. Validate everything before the first write.
`db.ts` wraps open/transaction failures in `StorageUnavailableError`.

- [ ] **Step 1: Write the failing tests:**
  - `todayLocal(new Date(2026, 9, 27, 0, 30))` → `'2026-10-27'` (local constructor).
  - db round trip: `putVisit`, then `getAllVisits` contains it; `deleteVisit` also removes its photos.
  - backup: export, clear the db, import → same visits, photo bytes and trip. Importing `{format:'other'}` throws `BackupFormatError` and leaves an existing visit untouched. `version: 2` throws. A visit for `Q999999999` (not in places) survives the round trip. Importing over an existing visit with a different note → the backup's note wins.
  - photos: `resizeImage` with a mocked `createImageBitmap` (4000×3000) draws to a canvas of 1600×1200 (spy on `OffscreenCanvas`/canvas `drawImage` args). If `createImageBitmap` is undefined, fall back to an `<img>` + canvas path (test that the fallback is called).
- [ ] **Step 2: Run** `npx vitest run src/storage src/logic/date.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** with `idb`; photo ids via `crypto.randomUUID()`; base64 via `FileReader` / `Uint8Array`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): IndexedDB storage, photo resize, backup`.

---

### Task 10: State store and map with Kosovo layer

**Files:**
- Create: `src/state/store.ts`, `src/map/tiles.ts`, `src/map/MapView.tsx`, `src/map/PlaceMarkers.tsx`, `src/map/KosovoLayer.tsx`, `src/map/KosovoToggle.tsx`, `src/ui/App.tsx`, `src/ui/LanguageSwitch.tsx`, `src/ui/Toast.tsx`, `src/ui/app.css`
- Modify: `src/main.tsx`
- Test: `src/state/store.test.ts`, `src/map/KosovoToggle.test.tsx`, `src/map/PlaceMarkers.test.ts`

**Interfaces:**
- Consumes: Tasks 8–9.
- Produces (`store.ts`, zustand):
  ```ts
  export interface AppState {
    status: 'loading' | 'ready' | 'error';
    places: Place[]; placesById: Map<string, Place>;
    areas: AreaFC | null; kosovo: GeoJSON.Feature | null;
    visits: Record<string, Visit>; trip: TripState; settings: Settings;
    selectedId: string | null; areaId: string | null; query: string;
    toast: { key: StringKey; kind: 'info' | 'error' } | null;
    storageOk: boolean;
    init(): Promise<void>;
    select(id: string | null): void;
    setQuery(q: string): void;
    setSettings(patch: Partial<Settings>): void;
    setArea(id: string | null): void;
    markVisited(id: string): Promise<void>;
    unmarkVisited(id: string): Promise<void>;
    updateVisit(id: string, patch: Partial<Pick<Visit, 'date' | 'note'>>): Promise<void>;
    addPhoto(id: string, file: File): Promise<void>;
    removePhoto(id: string, photoId: string): Promise<void>;
    addToTrip(id: string): void;
    removeFromTrip(id: string): void;
    moveTripStop(id: string, dir: -1 | 1): void;
    setTripStart(placeId: string | null): void;
    showToast(key: StringKey, kind?: 'info' | 'error'): void;
  }
  export const useApp: UseBoundStore<StoreApi<AppState>>;
  // PlaceMarkers.ts helpers
  export function markerStyle(p: Place, visited: boolean, inTrip: boolean): { radius: number; fillColor: string; color: string; weight: number };
  ```

Map details:
- `tiles.ts`: CARTO Voyager raster `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`, attribution `© OpenStreetMap contributors © CARTO`. One exported constant, so the provider is easy to swap.
- Initial view: bounds of all places; `maxBounds` = Serbia bbox padded by 1°.
- Markers: `CircleMarker` inside a `MarkerClusterGroup` with `disableClusteringAtZoom: 10`. `markerStyle` radius by tier 1→9, 2→7, 3→5, 4→4; fill by tier `#c0392b`, `#e67e22`, `#2e86c1`, `#7f8c8d`; visited `#27ae60`; trip `#f1c40f` (trip wins over visited); stroke `#ffffff`, weight 2, or `#333333` for trip. Clicking a marker calls `select(id)`.
- `KosovoLayer`: the outline as a GeoJSON polygon, fill `#8a6fa5` opacity 0.18, stroke `#8a6fa5` weight 1.5 `dashArray '6 4'`, non-interactive. Hidden when `kosovoShown` is false.
- `KosovoToggle`: a Leaflet top-right control rendered with React (portal into a `L.Control` container). It holds a checkbox "Show Kosovo" and an ⓘ button. The tooltip is shown on `:hover`/`:focus-within` of the control (CSS) **and** toggled by clicking ⓘ (state), so it works on touch. The tooltip has `role="tooltip"` and the checkbox has `aria-describedby` pointing to it. Clicks and scrolls on the control must not reach the map (`L.DomEvent.disableClickPropagation`).
- `init()`: load data, visits, trip and settings (settings default to `{...DEFAULT_SETTINGS, lang: detectLang(navigator.language)}`). If storage throws `StorageUnavailableError`, set `storageOk: false`, keep defaults, and still reach `status: 'ready'`. Persist settings and trip on every change. Call `requestPersistence()` on the first `markVisited`.
- `markVisited` creates `{placeId, date: todayLocal(), note: '', photoIds: []}` and then saves it; if saving fails, `showToast('storageError','error')` and roll back the in-memory change.
- `LanguageSwitch`: three buttons Ћир / Lat / EN in the panel header.

- [ ] **Step 1: Write the failing tests:**
  - store: with `db` mocked to throw `StorageUnavailableError`, `init()` ends with `status: 'ready'`, `storageOk: false`. `markVisited` with `putVisit` rejecting leaves `visits` without the id and sets an error toast.
  - `markerStyle`: tier 1 unvisited → radius 9, `#c0392b`; visited and in trip → `#f1c40f`.
  - `KosovoToggle`: render it, click ⓘ → the tooltip with the Kosovo note text is visible; unticking the checkbox calls `setSettings({kosovoShown:false})`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests (PASS). Then `npm run dev` and check in the browser: map with roads, coloured markers, purple Kosovo shading, toggle top-right with hover note, language switch changes the toggle label.
- [ ] **Step 5: Commit** `feat(app): store, map, markers and Kosovo layer`.

---

### Task 11: Side panel, place card and visit editor

**Files:**
- Create: `src/ui/SidePanel.tsx`, `src/ui/ProgressSummary.tsx`, `src/ui/Filters.tsx`, `src/ui/PlaceList.tsx`, `src/ui/PlaceCard.tsx`, `src/ui/VisitEditor.tsx`, `src/ui/BackupControls.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/app.css`
- Test: `src/ui/PlaceCard.test.tsx`, `src/ui/PlaceList.test.tsx`, `src/ui/VisitEditor.test.tsx`

**Interfaces:**
- Consumes: `useApp` (Task 10) and the i18n/logic functions (Task 8).
- Produces: React components with no props except `PlaceCard({ place }: { place: Place })` and `VisitEditor({ placeId }: { placeId: string })`.

Behaviour:
- Layout (desktop ≥ 768 px): a 300 px left panel and the map filling the rest. The card floats at the bottom-right of the map, 320 px wide, with a close ×.
- `ProgressSummary`: "N / M visited" (overall), then one line per tier 1–3, e.g. "UNESCO: 2 / 6".
- `Filters`: tier checkboxes (1–4) and culture/nature checkboxes.
- `PlaceList`: `filterPlaces` result, or `splitByArea` inside + nearby (nearby dimmed under a "Nearby" subheading) when an area is set. Virtualise only if there are more than 500 rows (otherwise a plain list). A row shows the tier dot, name and ✓ if visited. Clicking a row → `select(id)` and the map flies to it (zoom ≥ 12).
- `PlaceCard`: photo (if any) with the caption `© {author}, {license}` linked to `sourceUrl`; name; badges for each designation (localised); `partOf` line ("Part of: …"); type and municipality name; description, with the not-translated note when `untranslated`; access line (localised label, or "Information not available yet"); Wikipedia link in the current language, falling back to the other one; buttons **Mark as visited** / **Add to trip** (or Remove). Renders fine with no photo, description or area.
- `VisitEditor` (shown in the card when visited): date input (default from `markVisited`), note textarea (saved on blur and after 800 ms debounce), photo thumbnails with remove buttons, and an "Add photo" file input (`accept="image/*"`, multiple). Adding beyond 5 → toast. **Unmark** asks `window.confirm` only if the note is non-empty or there are photos.
- `BackupControls` (panel footer): Export (downloads `backupFileName()`); Import (file input → `window.confirm` with the counts from the parsed file → `importBackup` → toast with the result, or an error toast on `BackupFormatError`). If `storageOk` is false, show a persistent banner: "Your progress can't be saved in this browser (private mode?)."

- [ ] **Step 1: Write the failing tests:**
  - `PlaceCard` for a place with no photo, description or area renders the name and "Information not available yet" without crashing. With `access:'hike_boat'` it shows "Hike / boat only" (en). In `en` with only `descSr`, it shows the not-translated note.
  - Clicking **Mark as visited** calls `markVisited(id)`.
  - `VisitEditor`: with no note or photos, Unmark doesn't call `confirm`; with a note, it does, and cancelling keeps the visit. Adding a 6th photo shows a toast and doesn't call `addPhoto`. If `addPhoto` rejects (quota), the visit and note stay and an error toast appears.
  - `PlaceList`: with query "studen" only Studenica shows.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests (PASS). In the browser: mark a place, add a note and a photo, reload — it's still there; export, unmark, import — it's restored.
- [ ] **Step 5: Commit** `feat(app): side panel, place card, visit editor, backup controls`.

---

### Task 12: Browse by area

**Files:**
- Create: `src/ui/AreaPicker.tsx`, `src/map/AreaLayer.tsx`
- Modify: `src/ui/SidePanel.tsx`, `src/map/MapView.tsx`
- Test: `src/ui/AreaPicker.test.tsx`

**Interfaces:**
- Consumes: `areas`, `setArea`, `areaName`, `splitByArea`.
- Produces: `AreaPicker` (no props), `AreaLayer` (no props).

Behaviour:
- `AreaPicker`: a search input with suggestions (districts first, then municipalities, matched with `foldForSearch` on `areaName` in all scripts plus `nameSq`), a "Pick on map" button and a clear ×. Kosovo areas are hidden from suggestions when `kosovoShown` is false.
- "Pick on map": the next map click selects the municipality under the cursor (a district if the map zoom is < 9), then the mode ends. Esc cancels it.
- `AreaLayer`: draws the selected area's outline (`#222`, weight 2, no fill) and fits the map to it.
- The list switches to inside + nearby (Task 11). Markers outside both are drawn at opacity 0.25.

- [ ] **Step 1: Write the failing tests:** typing "kraljevo" suggests the municipality Kraljevo; typing "peja" in `en` suggests "Peć / Peja"; with Kosovo hidden, "peć" suggests nothing from Kosovo; choosing a suggestion calls `setArea(id)`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests (PASS). In the browser, pick Raški okrug: the outline is drawn, the list shows Studenica and Sopoćani, and places just over the border appear under "Nearby".
- [ ] **Step 5: Commit** `feat(app): browse by district and municipality`.

---

### Task 13: Trip planning and Google Maps

**Files:**
- Create: `src/trip/order.ts`, `src/trip/googleMaps.ts`, `src/ui/TripPanel.tsx`
- Modify: `src/state/store.ts` (trip actions), `src/ui/SidePanel.tsx` (Places / Trip tabs, Trip showing a count badge)
- Test: `src/trip/order.test.ts`, `src/trip/googleMaps.test.ts`, `src/state/trip.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MAX_TRIP_STOPS = 9;
  export function haversineKm(a: LatLon, b: LatLon): number;
  export function orderStops(stops: LatLon[], start?: LatLon): number[];   // permutation of stop indexes
  export function buildDirectionsUrl(stops: LatLon[], origin?: LatLon): string;
  ```

Rules:
- `orderStops`: with `start`, nearest neighbour from `start`, then 2-opt on the open path (start fixed, end free). Without `start`, run that from each stop as the first stop and keep the shortest. With 9 stops this is instant.
- `buildDirectionsUrl`: `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=<last>&waypoints=<rest joined by |>` plus `&origin=<lat,lon>` when an origin is given. Coordinates use 6 decimals, `lat,lon`; the `|` is URL-encoded. No origin → Google uses the user's current location.
- Store: `addToTrip` — already in the trip → no-op; at 9 stops → `showToast('tripFull')`, no change; otherwise insert and **re-order** all stops with `orderStops` (start = the start place's coordinate if set). `moveTripStop` swaps manually and doesn't re-order. Trip stops are kept when Kosovo is hidden (still listed in `TripPanel`, marked "hidden on map").
- `TripPanel`: an ordered list with ↑ ↓ ✕ per stop and a ✓ mark-visited per stop; "Start from" select (Your current location / any trip stop or any place via the card's "Set as trip start"); an "Optimise order" button (re-runs `orderStops`); **Open in Google Maps** (opens a new tab via `window.open(url, '_blank', 'noopener')`, disabled with no stops).

- [ ] **Step 1: Write the failing tests:**
  - `haversineKm` Belgrade (44.8176, 20.4633) → Novi Sad (45.2671, 19.8335) is within 70–75 km.
  - `orderStops` for 4 points on a line given shuffled (A at 0, D at 3, B at 1, C at 2) with start at A's west → visits A, B, C, D. The result is always a permutation of 0..n-1 (n = 1..9).
  - `buildDirectionsUrl` for 3 stops without origin → `destination` is the 3rd stop, `waypoints` has 2 entries, there's no `origin` param, and it contains `travelmode=driving`. With an origin → it contains `origin=`.
  - Store: adding the same id twice leaves one stop; adding a 10th stop → still 9 and a `tripFull` toast; hiding Kosovo doesn't remove a Kosovo stop.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests (PASS). In the browser, add 4 places in Šumadija, open Google Maps, and check the route shows 4 stops in a sensible order.
- [ ] **Step 5: Commit** `feat(app): trip planning with Google Maps handoff`.

---

### Task 14: Phone layout

**Files:**
- Modify: `src/ui/App.tsx`, `src/ui/SidePanel.tsx`, `src/ui/PlaceCard.tsx`, `src/ui/app.css`
- Test: `src/ui/App.layout.test.tsx`

Behaviour below 768 px (CSS media query plus a `useIsNarrow()` hook using `matchMedia('(max-width: 767px)')`):
- The map is full screen. A top bar holds the progress counter and a "List" button that opens the side panel as a full-height drawer from the left (with a close button). Selecting a place in the drawer closes it.
- The place card is a bottom sheet (full width, max 60 vh, scrollable).
- The Kosovo toggle stays top-right of the map; its ⓘ opens the note by tap (already supported by Task 10).
- Use `100dvh` (falling back to `100vh`), `env(safe-area-inset-*)` padding, a 16 px base font on inputs (prevents iOS zoom), and `-webkit-tap-highlight-color: transparent` on buttons.

- [ ] **Step 1: Write the failing test:** with `matchMedia` mocked to narrow, the panel isn't visible until "List" is clicked; selecting a place closes the drawer and shows the card with the `bottom-sheet` class.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests (PASS). In the browser at 375×812, check the drawer, the bottom sheet and the Kosovo tap note, with no horizontal scroll.
- [ ] **Step 5: Commit** `feat(app): phone layout`.

---

### Task 15: Deployment setup and README

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`
- Modify: `vite.config.ts` (`base` from the `BASE_PATH` env var, default `/`)

- GitHub Actions workflow: on push to `main`: `npm ci`, `npm test`, `npm run build` with `BASE_PATH=/<repo-name>/`, then deploy `dist/` with `actions/upload-pages-artifact` + `actions/deploy-pages`. It does **not** run `npm run data`; data is committed.
- README: what the app is; `npm run dev`; `npm run data` (how often, `REFRESH=1`, where the reports land); how to edit `data/overrides.json` (with an example setting `access` and adding a manual place); a note that progress lives in the browser and to export a backup regularly; deploy steps (create a GitHub repo, push, enable Pages → GitHub Actions). Alternative host: Cloudflare Pages with build command `npm run build` and output `dist`.

- [ ] **Step 1: Verify** `npm test` passes and `BASE_PATH=/serbia-explored/ npm run build` produces `dist/index.html` referencing `/serbia-explored/assets/…`, with `dist/data/places.json` present.
- [ ] **Step 2: Verify** `npm run preview` serves the built app with the map and data loaded.
- [ ] **Step 3: Commit** `chore: deployment workflow and README`.
- [ ] **Step 4: Owner step (not automated):** create the GitHub repository and push. Publishing is the owner's call.
