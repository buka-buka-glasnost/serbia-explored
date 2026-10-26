# Serbia Explored — Design

**Date:** 2026-10-26
**Status:** Draft, awaiting approval

## Intent and the why

The owner is from Serbia but hasn't travelled much within the country and hasn't seen its most important places. They want a web app that puts every place worth seeing in Serbia — cultural and natural — on one map, ranked by importance, and lets them check places off as they visit them. It doubles as a trip planner: pick the area you're heading to, see what's there, pick stops, and hand them to Google Maps to see how long the route takes.

It is a **personal tracker first**, but published so anyone with the link can use it for their own travels.

**Success:** the owner opens it before a weekend trip, finds what's worth seeing in that municipality or district, plans a route, and afterwards marks places visited with a date, note and photo — and watches the map turn green over time.

## Goals

1. Map of all important cultural and natural places in Serbia, including Kosovo (see below), with roads visible so accessibility can be roughly judged.
2. Tiered importance, combining national and international recognition.
3. Mark a place visited, with optional date, note and photo(s).
4. Browse by district (okrug) or municipality (opština).
5. Build a trip of up to 9 places and open it as a route in Google Maps.
6. Three interface languages: Serbian Cyrillic, Serbian Latin, English.
7. Usable by anyone via a public link; each person's progress is private to their browser.

## Non-goals (for now)

- User accounts, cross-device sync, social/sharing features. (Must remain addable later without a rewrite.)
- Multiple visits per place — one visit record per place.
- Places not in any register (towns as a whole, viewpoints, unprotected lakes/mountains). Manual additions are a likely future feature; the data model should allow them.
- Machine-translated descriptions.
- Native mobile app.
- Turn-by-turn routing inside the app — Google Maps does that.

## Anti-goals

- **Taking a political side on Kosovo.** The app must present Kosovo's status neutrally and factually.
- **Losing someone's travel history.** Progress lives in the browser, so export/import must exist from the first release and the app must never silently wipe data.
- **A cluttered map.** Thousands of markers at once would make it useless; lower tiers are hidden by default.
- **Fragile live dependencies.** The app must not depend on Wikidata or any data API being up at runtime.

## Content and data

### What's included

**Cultural** — Serbia's register of immovable cultural heritage (Republički zavod za zaštitu spomenika kulture). As of 2026-10-26 the register holds 2,658 entries: 2,277 cultural monuments, 97 spatial cultural-historical units, 203 archaeological sites, 81 historic landmarks. 201 are categorised *of exceptional importance* and 582 *of great importance*.

**Natural** — Serbia's protected natural areas (Zavod za zaštitu prirode Srbije): national parks (Fruška Gora, Đerdap, Tara, Kopaonik, Šar planina), special nature reserves, natural monuments, plus international designations (UNESCO Global Geopark Đerdap, UNESCO biosphere reserves such as Golija-Studenica, Ramsar wetlands). **Data quality of this source has not been checked yet** — see "Left to the builder".

**International** — UNESCO World Heritage (inscribed and tentative list).

### Sources

- **Primary: Wikidata.** Verified 2026-10-26 via the Wikidata Query Service. Items in Serbia carry the Serbian heritage categories as `P1435` (heritage designation), with coordinates (`P625`) on ~97% of categorised items and images (`P18`) on ~85%:
  - Exceptional importance: `Q3323436` (monuments, 166 items), `Q32459` (archaeological, 19), `Q5773555` (historic landmarks, 18), `Q15455839` (spatial units, 13) → ~216 total.
  - Great importance: `Q3323432` (546), `Q3485475` (29), `Q17097806` (25), `Q5773549` (16) → ~616 total.
  - Uncategorised: `Q3323469` monument of culture (1,661), `Q3485476`, `Q139254645`, `Q139257193`.
  - UNESCO: `Q9259` World Heritage Site, `Q43113623` part of a World Heritage Site, `Q1459900` tentative list. Also `Q19683138` Ramsar site.
  - Kosovo items may carry `P17 = Q1246` (Kosovo) and/or `Q403` (Serbia). Queries must accept both countries, but select by **Serbian** designations only. Items whose only designation is `Q6906963` (Cultural heritage monument of Kosovo) are **excluded** — owner's decision: nothing from Kosovo's own heritage register.
- **Cross-check: official Excel lists** from heritage.gov.rs (`SK.xls`, `PKIC.xls`, `AN.xls`, `ZM.xls`, `Kategorisani_izuz.xls`, `Kategorisani_veliki.xls`) — used to find register entries missing from Wikidata. Wikidata counts exceed official counts slightly (216 vs 201, 616 vs 582), so reconciliation is needed. The official online information system (nasledje.gov.rs) was down (database error) when checked, so don't rely on it.
- **Reconciliation policy (Claude's call):** what goes on the map at launch is Wikidata items carrying the Serbian heritage categories (or the UNESCO/nature designations), including Wikidata-only extras. Official entries missing from Wikidata are **not** geocoded at launch; the pipeline writes a report of them so the owner can add them later through the overrides file. Progress totals are therefore "places on the map", not the official register count.
- **Descriptions:** Wikipedia article intros (sr, en) linked from Wikidata.
- **Boundaries:** OpenStreetMap — districts (okrug), municipalities (opština), and Kosovo's outline.

### Tiers

One combined ranking across culture and nature:

| Tier | Name | Includes | Default visibility |
|------|------|----------|--------------------|
| 1 | World-class | UNESCO World Heritage (and parts of), UNESCO Geopark, UNESCO biosphere reserves | Shown |
| 2 | Nationally outstanding | Cultural heritage of exceptional importance; national parks; UNESCO tentative list | Shown |
| 3 | Significant | Cultural heritage of great importance; special nature reserves; Ramsar sites | Shown |
| 4 | Other protected | Uncategorised monuments; other protected nature | Hidden |

A place takes its **highest** applicable tier. A place that's part of a larger UNESCO site (e.g. Đurđevi stupovi within Stari Ras and Sopoćani) appears as its own place at tier 1, and shows which site it belongs to.

### Data pipeline

A build-time script (run by hand, not at app runtime) fetches from the sources above, merges, deduplicates, assigns tiers, transliterates, and writes static data files shipped with the app. Rerunning it refreshes the data. A small hand-edited **overrides file** lets the owner fix errors, set the access info, and (later) add places manually; overrides win over fetched data and survive reruns.

### Per-place data

- Stable ID (Wikidata QID where available)
- Name (Cyrillic original; English where Wikidata has one)
- Type (monastery, fortress, archaeological site, national park, …) and culture/nature flag
- Tier, and the designations behind it (shown as badges)
- Coordinates
- District and municipality
- Is in Kosovo (boolean)
- Photo (Wikimedia Commons image, with attribution) — optional
- Short description (sr; en where available) — optional
- **Access info** — one of: "drive to the door", "rough road", "hike / boat only", or **"information not available yet"** (the default for most places). Set via the overrides file.
- Links: Wikipedia, Wikidata

## Language

Interface switch: **Ћирилица / Latinica / English**.

- Store Serbian text in **Cyrillic** and generate Latin automatically (Cyrillic→Latin is a reliable letter-for-letter mapping; the reverse is ambiguous).
- Interface strings are translated by hand once.
- Place names in English mode: Wikidata English label if present, otherwise the Latin form (Kosovo: both names, see below).
- Descriptions in English mode: the English text if present, otherwise the **Serbian text (Latin) with a "not translated yet" note**. No machine translation.

## Kosovo

- Kosovo's places are **included and shown by default**.
- The Kosovo area is drawn as a **distinct shaded overlay** (a purple tint with a dashed edge in mockups) so it reads as disputed. The overlay is drawn by the app, independent of the base map.
- A **"Show Kosovo" switch in the top-right corner of the map** hides/shows Kosovo's places (and the overlay).
- **Hovering** over the switch (or its ⓘ icon) shows the note. On touch devices, tapping ⓘ shows it.
- Note text (to be translated into all three languages):

  > Kosovo's status is disputed. Serbia considers it part of its territory under UN Security Council Resolution 1244. Kosovo declared independence in 2008 and is recognised by many, but not all, countries. Several Serbian heritage sites there are on UNESCO's World Heritage list.

- The base map's own border rendering is not changed; the overlay is what conveys the dispute.
- **Administrative areas (owner's decision):** Kosovo places are filed under **Serbia's administrative division** — the 5 districts (Kosovski, Pećki, Prizrenski, Kosovsko-Mitrovački, Kosovsko-Pomoravski) and their municipalities as defined by Serbian law. OSM mostly maps Kosovo's own 7-district scheme, so the pipeline must source or assemble the Serbian-scheme boundaries separately (e.g. from Serbian official data, or by grouping municipality polygons into Serbian districts).
- **Names (owner's decision):** Serbian modes use Serbian names. English mode shows **both names** for Kosovo places and areas, Serbian first: "Peć / Peja". Where Wikidata's English label is the Albanian-derived form, the Serbian form is put first.
- **Content (owner's decision):** only places designated by Serbia (cultural register, nature register), UNESCO, or Ramsar. Kosovo's own heritage register and protected areas are not used. Šar planina appears once, as the Serbian national park.

## Screens and behaviour

Layout chosen: **list + map** on desktop (mockup "B v2"), collapsing to a map-first layout with a bottom card on phones.

### Desktop layout

- **Left panel:** overall progress ("7 / 216 visited"), search box, filters (tiers, culture/nature), area picker, and the list of places in view, sorted by tier. Clicking a list item flies the map to it and opens its card.
- **Map:** OpenStreetMap-based, with roads visible. Markers coloured and sized by tier; visited places green; trip places a distinct trip colour. Clustering where markers get dense.
- **Top-right of map:** Show Kosovo switch with hover note.
- **Bottom-right of map:** place card for the selected place.

### Place card

Photo, name, tier/designation badges, type and municipality, short description, access info ("information not available yet" by default), links, and actions: **Mark as visited**, **Add to trip**.

### Marking visited

- One click marks visited; date defaults to today and is editable.
- Then optional **note** and **photo(s)** (a few per place). Photos are resized/compressed in the browser on upload to keep storage small.
- Can be undone (unmark), with confirmation if a note or photos would be lost.
- Progress shown overall and **per tier** (e.g. "UNESCO: 2 / 6").

### Browsing by area

- Pick a district or municipality from a search box or by clicking it on the map.
- Map zooms to it and draws its boundary; the list shows only places inside.
- Places just outside the boundary are shown dimmed (nearby is still relevant for a trip).

### Trip planning

- **Add to trip** on any card; up to **9 places** (Google Maps URLs allow 10 stops including the origin).
- Trip list in the left panel; remove or reorder.
- **Open in Google Maps** builds a directions URL from the user's current location (or a chosen start) through the stops. The app orders stops in a sensible driving order before building the URL (Google won't reorder them).
- After the trip, visited places can be marked from the trip list.

## User data and storage

- All personal data (visits, dates, notes, photos, trip, settings) lives in the browser — **IndexedDB** (photos make localStorage too small).
- **Export/import** to a single backup file (including photos) from the first release. This is how data moves between devices.
- Ask the browser for persistent storage so data isn't evicted.
- Data model kept separate from the storage layer so accounts/sync can be added later.

## Approaches

Considered:

1. **Static website with data built in; progress in the browser** — a build-time script prepares place data; the site is static and free to host; personal data in IndexedDB with export/import. *Trade-off:* no automatic sync between devices.
2. **Website plus a server and accounts from day one** (e.g. Supabase) — sync across devices and sharing. *Trade-off:* more to build and run, possible storage costs for photos, login wall for a personal tool.
3. **Fetch from Wikidata live in the browser** — always fresh. *Trade-off:* slow, fragile (Wikidata was unreliable during our check), and no place to fix data or add places. Rejected.

**Chosen: 1** — the owner picked it. It matches "personal first, usable by others", and can grow into 2 later.

## Technology (Claude's call — owner delegated tech and hosting)

- **App:** React + TypeScript, built with Vite.
- **Map:** Leaflet with OpenStreetMap-based tiles showing roads. Use a tile provider whose free tier/policy allows a public app (OSM's own tile servers have a strict usage policy).
- **Data script:** Node/TypeScript, querying the Wikidata Query Service, Wikipedia, and OSM (Overpass) for boundaries; output static JSON/GeoJSON.
- **Hosting:** Cloudflare Pages or GitHub Pages (free, static).
- **Storage:** IndexedDB via a small wrapper library.

## Constraints

- Static hosting only — no server-side code.
- Must work well on desktop and phone browsers.
- Must not rely on any external data API at runtime (map tiles and Google Maps links excepted).
- Photo attribution for Wikimedia Commons images must be shown (licence requirement).
- Map tile provider's usage terms must be respected.

## Left to the builder

- Assessing the nature-protection register's data (format, coordinates, completeness) and choosing how to bring it in — Wikidata may already cover national parks and many reserves.
- Exact reconciliation between Wikidata and the official Excel lists.
- Choice of tile provider, clustering library, IndexedDB wrapper, and the stop-ordering method for trips.
- Exact marker colours, icons and visual design (the mockups are wireframes).
- Photo size limits and compression settings.
- The exact definition of "just outside the area" for dimmed places.

## Mockups

`.superpowers/brainstorm/1216-1793017657/content/main-layout-v2.html` — chosen desktop layout.
