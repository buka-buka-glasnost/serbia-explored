import type { AreaProps, Lang, Place } from '../shared/types';
import { foldForSearch, toLatin } from '../shared/translit';
import { STRINGS, type StringKey } from './strings';

export function t(key: StringKey, lang: Lang): string {
  const entry = STRINGS[key];
  if (lang === 'en') return entry.en;
  return lang === 'sr-Latn' ? toLatin(entry.sr) : entry.sr;
}

// Word forms by plural category (Serbian: 1 / 2–4 / 5+; English: 1 / other).
const COUNT_WORDS = {
  visits: { sr: { one: 'посета', few: 'посете', other: 'посета' }, en: { one: 'visit', other: 'visits' } },
  photos: { sr: { one: 'фотографија', few: 'фотографије', other: 'фотографија' }, en: { one: 'photo', other: 'photos' } },
} as const;

/** "1 visit", "3 посете", "5 фотографија": a number with the right word form. */
export function countOf(kind: keyof typeof COUNT_WORDS, n: number, lang: Lang): string {
  if (lang === 'en') {
    const forms = COUNT_WORDS[kind].en;
    return `${n} ${new Intl.PluralRules('en').select(n) === 'one' ? forms.one : forms.other}`;
  }
  const forms: Record<string, string> = COUNT_WORDS[kind].sr;
  const word = forms[new Intl.PluralRules('sr').select(n)] ?? forms.other;
  return `${n} ${lang === 'sr-Latn' ? toLatin(word) : word}`;
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

/** Kind of place ("манастир", "monastery"), from Wikidata; English falls back to Latin Serbian. */
export function placeType(p: Place, lang: Lang): string | undefined {
  if (lang === 'en') return p.typeEn ?? (p.typeSr ? toLatin(p.typeSr) : undefined);
  if (!p.typeSr) return undefined;
  return lang === 'sr-Latn' ? toLatin(p.typeSr) : p.typeSr;
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
