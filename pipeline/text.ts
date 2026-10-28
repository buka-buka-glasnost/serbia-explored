/**
 * Clean-up for text that comes from Wikidata and Wikipedia.
 *
 * Some labels mix scripts inside one word using look-alike letters
 * ("Стара планинa" with a Latin "a", "Оld village" with a Cyrillic "О"). They
 * look right but break search and sorting, so each such word is moved to one
 * script. Wikipedia extracts also leave gaps where markup was removed
 * ("баштине ." or "Милачићи , насељеном").
 */

// Pairs of letters that look the same in Latin and Cyrillic.
const PAIRS: [latin: string, cyrillic: string][] = [
  ['a', 'а'], ['e', 'е'], ['o', 'о'], ['p', 'р'], ['c', 'с'], ['x', 'х'], ['y', 'у'], ['j', 'ј'],
  ['A', 'А'], ['B', 'В'], ['E', 'Е'], ['K', 'К'], ['M', 'М'], ['H', 'Н'], ['O', 'О'], ['P', 'Р'],
  ['C', 'С'], ['T', 'Т'], ['X', 'Х'], ['J', 'Ј'],
];
const TO_CYRILLIC = new Map(PAIRS);
const TO_LATIN = new Map(PAIRS.map(([l, c]) => [c, l]));

const isCyrillic = (ch: string) => /\p{Script=Cyrillic}/u.test(ch);
const isLatin = (ch: string) => /\p{Script=Latin}/u.test(ch);

/** Letters that only exist in one script decide it; look-alikes don't count. */
function distinctive(text: string): { cyr: number; lat: number } {
  let cyr = 0;
  let lat = 0;
  for (const ch of text) {
    if (isCyrillic(ch) && !TO_LATIN.has(ch)) cyr++;
    else if (isLatin(ch) && !TO_CYRILLIC.has(ch)) lat++;
  }
  return { cyr, lat };
}

function scriptCounts(text: string): { cyr: number; lat: number } {
  let cyr = 0;
  let lat = 0;
  for (const ch of text) {
    if (isCyrillic(ch)) cyr++;
    else if (isLatin(ch)) lat++;
  }
  return { cyr, lat };
}

const convert = (word: string, map: Map<string, string>) => [...word].map((ch) => map.get(ch) ?? ch).join('');

/** Moves every word that mixes Latin and Cyrillic look-alike letters to a single script. */
export function fixMixedScript(text: string): string {
  // Decided once per text, for words made only of look-alike letters.
  let fallback: 'cyr' | 'lat' | undefined;
  const textScript = (): 'cyr' | 'lat' => {
    if (fallback) return fallback;
    const d = distinctive(text);
    const s = d.cyr !== d.lat ? d : scriptCounts(text);
    fallback = s.cyr >= s.lat ? 'cyr' : 'lat';
    return fallback;
  };
  return text.replace(/\p{L}+/gu, (word) => {
    const all = scriptCounts(word);
    if (all.cyr === 0 || all.lat === 0) return word; // one script already
    const d = distinctive(word);
    if (d.cyr > 0 && d.lat > 0) return word; // genuinely mixed: leave it
    const script = d.cyr > 0 ? 'cyr' : d.lat > 0 ? 'lat' : textScript();
    return convert(word, script === 'cyr' ? TO_CYRILLIC : TO_LATIN);
  });
}

/** Removes spaces before punctuation and inside brackets, collapses runs of spaces, keeps paragraph breaks. */
export function tidySpacing(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t ]+/g, ' ')
        .replace(/ +([.,;:!?)\]])/g, '$1')
        .replace(/([([]) +/g, '$1')
        .trim(),
    )
    .filter((line) => line !== '')
    .join('\n');
}

/** Unexpanded templates sometimes leak into extracts ("8Шаблон:Celsius"): repair the known one, drop the rest. */
function repairTemplates(text: string): string {
  return text
    .replace(/\s*(?:Шаблон|Šablon|Template):Celsius/g, ' °C')
    .replace(/\s*(?:Шаблон|Šablon|Template):\S+/g, '');
}

export function cleanText(text: string): string {
  return tidySpacing(fixMixedScript(repairTemplates(text)));
}
