import type { Place } from '../shared/types';
import { foldForSearch } from '../shared/translit';

// foldForSearch maps đ to "dj"; also collapse "dj" to "d" so "davolja" finds "Đavolja".
export const loose = (text: string): string => foldForSearch(text).replace(/dj/g, 'd');

const fields = (p: Place) => [p.nameSr, p.nameEn, p.nameSq, p.typeSr];

/**
 * How well a place matches, for sorting: 0 when one of its names starts with the query
 * ("Studenica monastery"), 1 when a word of its names or type does ("žiča" in "Манастир
 * Жича"), 2 when the query only appears inside a word ("Караџића").
 */
export function matchRank(p: Place, query: string): 0 | 1 | 2 {
  const q = loose(query.trim());
  if (!q) return 0;
  if ([p.nameSr, p.nameEn, p.nameSq].some((f) => f !== undefined && loose(f).startsWith(q))) return 0;
  // words start after a space, a dash, a bracket or a quote: "(Голија–Студеница)", "„Сава“"
  return fields(p).some((f) => f !== undefined && ` ${loose(f).replace(/[^\p{L}\p{N}]+/gu, ' ')}`.includes(` ${q}`)) ? 1 : 2;
}

export function matchesQuery(p: Place, query: string): boolean {
  const q = loose(query.trim());
  if (!q) return true;
  return fields(p).some(
    (f) => f !== undefined && loose(f).includes(q),
  );
}
