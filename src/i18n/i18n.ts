import type { AreaProps, Lang, Place } from '../shared/types';
import { foldForSearch, toLatin } from '../shared/translit';
import { STRINGS, type StringKey } from './strings';

export function t(key: StringKey, lang: Lang): string {
  const entry = STRINGS[key];
  if (lang === 'en') return entry.en;
  return lang === 'sr-Latn' ? toLatin(entry.sr) : entry.sr;
}

interface Named { nameSr: string; nameEn?: string; nameSq?: string; inKosovo: boolean }

function localName(n: Named, lang: Lang): string {
  if (lang === 'sr-Cyrl') return n.nameSr;
  const latin = toLatin(n.nameSr);
  if (lang === 'sr-Latn') return latin;
  if (n.inKosovo && n.nameSq && foldForSearch(n.nameSq) !== foldForSearch(n.nameSr)) {
    return `${latin} / ${n.nameSq}`;
  }
  return n.nameEn ?? latin;
}

export function placeName(p: Place, lang: Lang): string {
  return localName(p, lang);
}

export function areaName(a: AreaProps, lang: Lang): string {
  return localName(a, lang);
}

export function placeDescription(
  p: Place,
  lang: Lang,
): { text: string; untranslated: boolean } | null {
  if (lang === 'en') {
    if (p.descEn) return { text: p.descEn, untranslated: false };
    if (p.descSr) return { text: toLatin(p.descSr), untranslated: true };
    return null;
  }
  if (!p.descSr) return null;
  return { text: lang === 'sr-Latn' ? toLatin(p.descSr) : p.descSr, untranslated: false };
}

export function detectLang(navigatorLanguage: string | undefined): Lang {
  return navigatorLanguage?.toLowerCase().startsWith('sr') ? 'sr-Cyrl' : 'en';
}
