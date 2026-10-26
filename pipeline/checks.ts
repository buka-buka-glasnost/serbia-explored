import type { AreaFC, Place } from '../src/shared/types';

/** Data problems that would be visible to users; build-data fails on any unless --allow-warnings. */
export function checkPlaces(places: Place[], areas: AreaFC): string[] {
  const kosovoByMun = new Map(
    areas.features.filter((f) => f.properties.level === 'municipality')
      .map((f) => [f.properties.id, f.properties.inKosovo]),
  );
  const out: string[] = [];
  for (const p of places) {
    if (p.tier <= 3 && p.nameSr === p.id) out.push(`${p.id}: tier ${p.tier} place is named by its id`);
    if (p.partOf && p.partOf.nameSr === p.partOf.id) out.push(`${p.id}: partOf ${p.partOf.id} is named by its id`);
    const k = p.municipalityId ? kosovoByMun.get(p.municipalityId) : undefined;
    if (k !== undefined && k !== p.inKosovo) {
      out.push(`${p.id} (${p.nameSr}): inKosovo=${p.inKosovo} but municipality ${p.municipalityId} has inKosovo=${k}`);
    }
  }
  return out;
}
