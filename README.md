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
- Reports are written to `data/reports/`:
  - `dropped.csv`: places discarded by the pipeline, with the reason.
  - `missing-from-map.csv`: places that could not be reconciled with the map.

Commit the regenerated data files afterwards.

## Editing `data/overrides.json`

Manual corrections live in `data/overrides.json` and are applied on every `npm run data`, so they survive refreshes:

```json
{
  "places": {
    "Q904128": { "access": "hike_boat", "tier": 2 }
  },
  "added": [
    {
      "id": "x-my-spot",
      "nameSr": "Моје место",
      "nameEn": "My Spot",
      "kind": "nature",
      "tier": 3,
      "designations": [],
      "lat": 43.9,
      "lon": 20.35,
      "districtId": null,
      "municipalityId": "m-kraljevo",
      "inKosovo": false,
      "access": "rough"
    }
  ],
  "removed": ["Q849517"]
}
```

- `places`: patch an existing place by id (Wikidata QID). Any subset of its fields can be given, e.g. `access` (`"door"`, `"rough"`, `"hike_boat"` or `null`), `nameSr` (Cyrillic), `lat`/`lon`, `kind` (`"culture"` or `"nature"`), `tier` (1-4), `designations`, `districtId`/`municipalityId` (such as `"m-kraljevo"`), `inKosovo`.
- `added`: full place objects for manual places. Their ids must be `x-<slug>` and must not collide with an existing id.
- `removed`: ids to drop.

Unknown ids in `places` or `removed`, or an `added` id that already exists, make the build throw. This is deliberate typo protection. See `pipeline/overrides.ts` and `src/shared/types.ts` for the exact shape.

## Backups

Visit progress lives only in your browser (IndexedDB). Clearing site data or switching browsers loses it, so use the Export button in the app regularly to download a backup file, and Import to restore it.

## Deploy

GitHub Pages (via the workflow in `.github/workflows/deploy.yml`):

1. Create a GitHub repository and push this project to it, with `main` as the default branch.
2. In the repo, go to Settings > Pages and set Source to "GitHub Actions".
3. Every push to `main` runs `npm ci`, `npm test`, then builds with `BASE_PATH=/<repo-name>/` and deploys `dist/`. The site appears at `https://<user>.github.io/<repo-name>/`.

The Vite `base` comes from the `BASE_PATH` environment variable (default `/`), and the app loads its data relative to it.

Alternative: Cloudflare Pages. Connect the repo, set the build command to `npm run build` and the output directory to `dist`. Leave `BASE_PATH` unset, since the site is served from the root.
