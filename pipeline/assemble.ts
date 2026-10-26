import type { AreaFC, Designation, Photo, Place } from '../src/shared/types';
import { hasCyrillic } from '../src/shared/translit';
import { assignArea, isInKosovo } from './areas';
import { NATURE_DESIGNATIONS, tierFor } from './designations';
import { trimExtract } from './enrich';
import type { RawPlace } from './normalize';
import { applyOverrides, type Overrides } from './overrides';

export interface DroppedPlace {
  id: string;
  name: string;
  reason:
    | 'no_coordinates'
    | 'outside_serbia'
    | 'kosovo_nature_not_serbian'
    | 'whs_composite'
    | 'removed_by_override';
}

export interface AssembleInput {
  raw: RawPlace[];
  areas: AreaFC;
  kosovo: GeoJSON.Feature;
  extractsSr: Map<string, string>;
  extractsEn: Map<string, string>;
  photos: Map<string, Photo>;
  kosovoNatureAllowlist: string[];
  overrides: Overrides;
}

/** Serbian display name: Cyrillic label, else the sr-el label, else the plain sr label, else English, else the QID. */
export function displayName(r: RawPlace): string {
  if (r.nameSr && hasCyrillic(r.nameSr)) return r.nameSr;
  return r.nameSrLatn ?? r.nameSr ?? r.nameEn ?? r.id;
}

const byTierThenName = (a: Place, b: Place) =>
  a.tier - b.tier || a.nameSr.localeCompare(b.nameSr, 'sr');

export function assemblePlaces(input: AssembleInput): { places: Place[]; dropped: DroppedPlace[] } {
  const { raw, areas, kosovo, overrides } = input;
  const dropped: DroppedPlace[] = [];
  const drop = (r: RawPlace, reason: DroppedPlace['reason']) =>
    dropped.push({ id: r.id, name: displayName(r), reason });

  const whsById = new Map(raw.filter((r) => r.designations.includes('unesco_whs')).map((r) => [r.id, r]));
  const composites = new Set<string>();
  for (const r of raw) for (const q of r.partOfIds) if (whsById.has(q)) composites.add(q);
  const allowlist = new Set(input.kosovoNatureAllowlist);

  const places: Place[] = [];
  for (const r of raw) {
    // 1. coordinates
    if (!r.coord) { drop(r, 'no_coordinates'); continue; }

    // 3. a WHS that other items are parts of is only a container
    if (composites.has(r.id)) { drop(r, 'whs_composite'); continue; }

    // 2. parts of a WHS
    const designations: Designation[] = [...r.designations];
    const whsParent = r.partOfIds.map((q) => whsById.get(q)).find((w) => w !== undefined);
    if (whsParent && !designations.includes('unesco_whs_part')) designations.push('unesco_whs_part');

    // 4. Kosovo
    const inKosovo = isInKosovo(r.coord, kosovo);
    const allNature = designations.every((d) => NATURE_DESIGNATIONS.has(d));
    if (inKosovo && allNature && !allowlist.has(r.id)) { drop(r, 'kosovo_nature_not_serbian'); continue; }

    // 5. area
    const area = assignArea(r.coord, areas);
    if (!area.municipalityId && !inKosovo) { drop(r, 'outside_serbia'); continue; }

    const photo = r.imageFile ? input.photos.get(r.imageFile) : undefined;
    const sr = r.wikipediaSr ? input.extractsSr.get(r.wikipediaSr) : undefined;
    const en = r.wikipediaEn ? input.extractsEn.get(r.wikipediaEn) : undefined;
    const place: Place = {
      id: r.id,
      nameSr: displayName(r),
      nameEn: r.nameEn,
      nameSq: inKosovo ? r.nameSq : undefined,
      typeSr: r.typeSr,
      typeEn: r.typeEn,
      kind: allNature ? 'nature' : 'culture',
      tier: tierFor(designations),
      designations,
      partOf: whsParent
        ? { id: whsParent.id, nameSr: displayName(whsParent), nameEn: whsParent.nameEn }
        : undefined,
      lat: r.coord.lat,
      lon: r.coord.lon,
      districtId: area.districtId,
      municipalityId: area.municipalityId,
      inKosovo,
      photo,
      descSr: sr ? trimExtract(sr) : undefined,
      descEn: en ? trimExtract(en) : undefined,
      access: null,
      wikipediaSr: r.wikipediaSr,
      wikipediaEn: r.wikipediaEn,
    };
    // keep the JSON compact: no undefined keys
    for (const k of Object.keys(place) as (keyof Place)[]) if (place[k] === undefined) delete place[k];
    places.push(place);
  }

  // 9. overrides last
  const names = new Map(places.map((p) => [p.id, p.nameSr]));
  for (const id of overrides.removed) {
    if (names.has(id)) dropped.push({ id, name: names.get(id)!, reason: 'removed_by_override' });
  }
  const final = applyOverrides(places, overrides);

  // 10. order
  return { places: final.sort(byTierThenName), dropped };
}
