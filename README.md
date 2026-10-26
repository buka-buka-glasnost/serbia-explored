# Serbia Explored

A static map app (React + TypeScript + Vite + Leaflet) for tracking which important cultural and natural places in Serbia you have visited. Place data comes from Wikidata, Wikipedia, Wikimedia Commons, OpenStreetMap and heritage.gov.rs, built offline by a pipeline in `pipeline/` and committed to the repo. Your progress is stored in your browser, not on a server.

## Develop

```
npm ci
npm run dev      # local dev server
npm test         # Vitest
npm run build    # type-check + production build into dist/
npm run preview  # serve the built app locally
```

Map tiles are the standard OpenStreetMap tiles, which is fine for personal or low traffic. If traffic grows, switch provider in `src/map/tiles.ts`.

## Refreshing the data

```
npm run data
```

This rebuilds `public/data/places.json` and the area files from the upstream sources. Running it once in a while (every few months) is plenty; the committed data is what gets deployed, and the CI deploy never runs it.

- `REFRESH=1 npm run data` bypasses the caches in `data/cache/` (git-ignored) and re-downloads everything. A full refresh takes roughly 20-40 minutes because Wikidata is slow. On Windows PowerShell use `$env:REFRESH=1; npm run data`.
- `npm run data -- --skip-reconcile` skips the reconciliation step against the map data.
- All checks run before anything is written, and the outputs are written to temporary files and renamed at the end, so a failed run leaves the previous data untouched. A data check failure stops the run (`npm run data -- --allow-warnings` accepts the warnings); unexpected district/municipality counts (25/161 outside Kosovo, 5/29 in the Kosovo scheme) always stop it.
- Requests send the User-Agent `SerbiaExplored/0.1 (https://github.com/buka-buka-glasnost/serbia-explored; data pipeline)`, as Wikimedia's policy asks for a contact URL. It is defined once, in `pipeline/http.ts`.
- Road-based access estimates are cached per coordinate in `data/cache/osm/access-by-point.v1.json`; the number is bumped (`ACCESS_RULES_VERSION` in `pipeline/access.ts`) whenever the access rules change, which starts a fresh cache.
- Reports are written to `data/reports/`:
  - `dropped.csv`: places discarded by the pipeline, with the reason.
  - `missing-from-map.csv`: places that could not be reconciled with the map.

Commit the regenerated data files afterwards.

## Editing `data/overrides.json`

Manual corrections live in `data/overrides.json` and are applied on every `npm run data`, so they survive refreshes:

```json
{
  "places": {
    "Q20435442": { "access": "rough" }
  },
  "added": [
    {
      "id": "x-my-spot",
      "nameSr": "Моје место",
      "nameEn": "My Spot",
      "designations": ["nature_other"],
      "lat": 43.855,
      "lon": 19.85,
      "access": "rough"
    }
  ],
  "removed": ["Q849517"],
  "_removedNotes": { "Q849517": "why it is removed" }
}
```

- `places`: patch an existing place by id (Wikidata QID). Any subset of its fields can be given, e.g. `access` (`"door"`, `"rough"`, `"hike_boat"` or `null`), `nameSr` (Cyrillic), `lat`/`lon`, `kind` (`"culture"` or `"nature"`), `tier` (1-4), `designations`, `districtId`/`municipalityId` (such as `"m-uzice"`), `inKosovo`.
- `added`: manual places. Only `id`, `nameSr`, `lat`, `lon` and `designations` (at least one) are required; `tier` and `kind` are derived from the designations, `districtId`/`municipalityId`/`inKosovo` from the coordinates, and `access` defaults to `null`. Any other place field may be given and is kept as is. Ids should look like `x-<slug>` (a convention, not enforced) and must not collide with an existing id.
- `removed`: ids to drop. `_removedNotes` maps a removed id to the reason, and `_overrideNotes` a patched id to the reason for its patch (documentation only; each note must refer to an id that is removed or patched).
- `partOfNames`: display names for World Heritage composites whose Wikidata labels are missing.

### Access estimates

`npm run data` estimates `access` for each place from OpenStreetMap roads within 300 m: a paved road within 150 m means "drive to the door", a closer gravel/dirt road or track means "rough road", nothing drivable means "hike / boat only". Large areas (national parks, biosphere reserves, the geopark, Ramsar sites) get no estimate. Estimates are marked `"accessEstimated": true` and the app shows them with an asterisk. Setting `access` in `places` replaces the estimate and removes the asterisk.

When a Wikidata item has several coordinates, the pipeline picks one deterministically (the smallest by value), and the build summary lists places whose coordinates are more than 1 km apart; pin the right one with a `lat`/`lon` patch. Patches re-derive what they invalidate: changing `designations` recomputes `tier` and `kind`, and changing `lat`/`lon` recomputes `districtId`, `municipalityId` and `inKosovo`, unless the same patch sets those fields itself. The build checks that every place's `tier` matches its designations, so set `designations` rather than `tier`.

The file is validated when it is loaded: only the keys `places`, `added`, `removed`, `partOfNames`, `_removedNotes` and `_overrideNotes` are allowed, patches may only use place fields, designations must be known values, and an id may not be both patched and removed. Unknown ids in `places` or `removed`, or an `added` id that already exists, make the build throw; when the id exists in Wikidata but the pipeline dropped it (for example for missing coordinates), the error names the reason. This is deliberate typo protection. See `pipeline/overrides.ts` and `src/shared/types.ts` for the exact shape.

## Backups

Visit progress lives only in your browser (IndexedDB). Clearing site data or switching browsers loses it, so use the Export button in the app regularly to download a backup file, and Import to restore it.

## Deploy

GitHub Pages (via the workflow in `.github/workflows/deploy.yml`):

1. Create a GitHub repository and push this project to it, with `main` as the default branch.
2. In the repo, go to Settings > Pages and set Source to "GitHub Actions".
3. Every push to `main` runs `npm ci`, `npm test`, then builds with `BASE_PATH=/<repo-name>/` and deploys `dist/`. The site appears at `https://<user>.github.io/<repo-name>/`.

The Vite `base` comes from the `BASE_PATH` environment variable (default `/`), and the app loads its data relative to it. For a local build with a base path in Git Bash on Windows, prefix the command with `MSYS_NO_PATHCONV=1` (for example `MSYS_NO_PATHCONV=1 BASE_PATH=/serbia-explored/ npm run build`), otherwise Git Bash rewrites the path.

Alternative: Cloudflare Pages. Connect the repo, set the build command to `npm run build` and the output directory to `dist`. Leave `BASE_PATH` unset, since the site is served from the root. Set the environment variable `NODE_VERSION` to `20` or higher (Node >= 20 is required).

## License and data sources

The code is released under the MIT License (see `LICENSE`). The generated data in `public/data/` and `data/reports/` is not covered by it; it keeps the licenses of its sources:

- **Wikidata** (places, designations, coordinates): CC0.
- **Wikipedia** (place descriptions): CC BY-SA 4.0. Text is excerpted from the Serbian and English Wikipedia articles linked on each place card.
- **Wikimedia Commons** (photos): each photo's own license. The app shows the author and license on every photo and links to its Commons page.
- **OpenStreetMap** (district and municipality boundaries, the Kosovo outline, map tiles): © OpenStreetMap contributors, ODbL.
- **Republički zavod za zaštitu spomenika kulture** (official heritage register lists, used only to build `data/reports/missing-from-map.csv`).
