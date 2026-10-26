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
    "Q20435442": { "access": "rough" }
  },
  "added": [
    {
      "id": "x-my-spot",
      "nameSr": "Моје место",
      "nameEn": "My Spot",
      "kind": "nature",
      "tier": 3,
      "designations": [],
      "lat": 43.855,
      "lon": 19.85,
      "districtId": null,
      "municipalityId": "m-uzice",
      "inKosovo": false,
      "access": "rough"
    }
  ],
  "removed": ["Q849517"]
}
```

- `places`: patch an existing place by id (Wikidata QID). Any subset of its fields can be given, e.g. `access` (`"door"`, `"rough"`, `"hike_boat"` or `null`), `nameSr` (Cyrillic), `lat`/`lon`, `kind` (`"culture"` or `"nature"`), `tier` (1-4), `designations`, `districtId`/`municipalityId` (such as `"m-uzice"`), `inKosovo`.
- `added`: full place objects for manual places. Their ids should look like `x-<slug>` (a convention, not enforced) and must not collide with an existing id. The example point lies inside the municipality given; use `"municipalityId": null` if you do not want to look one up.
- `removed`: ids to drop.

Overriding `lat`/`lon` does not recompute the district, municipality or `inKosovo`; patch those fields too. Likewise change `tier` together with `designations`, since tiers are normally derived from designations.

Unknown ids in `places` or `removed`, or an `added` id that already exists, make the build throw. This is deliberate typo protection. See `pipeline/overrides.ts` and `src/shared/types.ts` for the exact shape.

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
