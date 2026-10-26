import type { Place, Tier } from '../shared/types';

export interface Count { visited: number; total: number }

export function computeProgress(
  places: Place[],
  visitedIds: Set<string>,
  kosovoShown: boolean,
): { overall: Count; byTier: Record<Tier, Count> } {
  const empty = (): Count => ({ visited: 0, total: 0 });
  const overall = empty();
  const byTier: Record<Tier, Count> = { 1: empty(), 2: empty(), 3: empty(), 4: empty() };
  for (const p of places) {
    if (!kosovoShown && p.inKosovo) continue;
    const seen = visitedIds.has(p.id);
    const targets = p.tier <= 3 ? [overall, byTier[p.tier]] : [byTier[p.tier]];
    for (const c of targets) {
      c.total++;
      if (seen) c.visited++;
    }
  }
  return { overall, byTier };
}
