import type { AreaFC, Place } from '../src/shared/types';
import { EXPECTED_AREA_COUNTS } from './areas';
import { tierFor } from './designations';

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
    if (!p.municipalityId && !p.inKosovo) {
      out.push(`${p.id} (${p.nameSr}): no municipality and not in Kosovo (coordinates ${p.lat}, ${p.lon} outside Serbia?)`);
    }
    if (p.designations.length === 0) {
      out.push(`${p.id} (${p.nameSr}): no designations`);
    } else if (p.tier !== tierFor(p.designations)) {
      out.push(`${p.id} (${p.nameSr}): tier ${p.tier} but its designations give tier ${tierFor(p.designations)}`);
    }
  }
  return out;
}

/** District and municipality counts inside and outside Kosovo; any mismatch with EXPECTED_AREA_COUNTS is an error. */
export function checkAreaCounts(
  areas: AreaFC,
  expected: Record<'serbia' | 'kosovo', { districts: number; municipalities: number }> = EXPECTED_AREA_COUNTS,
): string[] {
  const n = (level: 'district' | 'municipality', inKosovo: boolean) =>
    areas.features.filter((f) => f.properties.level === level && f.properties.inKosovo === inKosovo).length;
  const out: string[] = [];
  for (const [scheme, inKosovo] of [['serbia', false], ['kosovo', true]] as const) {
    const want = expected[scheme];
    const got = { districts: n('district', inKosovo), municipalities: n('municipality', inKosovo) };
    for (const k of ['districts', 'municipalities'] as const) {
      if (got[k] !== want[k]) {
        out.push(`${scheme === 'serbia' ? 'outside Kosovo' : 'Kosovo scheme'}: ${got[k]} ${k}, expected ${want[k]}`);
      }
    }
  }
  return out;
}
