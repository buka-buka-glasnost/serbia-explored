import type { Place } from '../shared/types';
import { foldForSearch } from '../shared/translit';

// foldForSearch maps đ to "dj"; also collapse "dj" to "d" so "davolja" finds "Đavolja".
const loose = (text: string): string => foldForSearch(text).replace(/dj/g, 'd');

export function matchesQuery(p: Place, query: string): boolean {
  const q = loose(query.trim());
  if (!q) return true;
  return [p.nameSr, p.nameEn, p.nameSq, p.typeSr].some(
    (f) => f !== undefined && loose(f).includes(q),
  );
}
