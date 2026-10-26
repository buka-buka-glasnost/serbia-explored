const LOWER: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

const CYRILLIC = /[\u0400-\u04FF]/;

export function hasCyrillic(text: string): boolean {
  return CYRILLIC.test(text);
}

function isUpperCyrillic(ch: string | undefined): boolean {
  return !!ch && ch !== ch.toLowerCase() && ch.toLowerCase() in LOWER;
}

export function toLatin(text: string): string {
  const chars = Array.from(text);
  let out = '';
  chars.forEach((ch, i) => {
    const lower = ch.toLowerCase();
    const mapped = LOWER[lower];
    if (mapped === undefined) {
      out += ch;
      return;
    }
    if (ch === lower) {
      out += mapped;
      return;
    }
    // Upper-case letter
    if (mapped.length === 1) {
      out += mapped.toUpperCase();
    } else {
      // digraph: all caps if the next letter is also upper-case
      out += isUpperCyrillic(chars[i + 1])
        ? mapped.toUpperCase()
        : mapped[0].toUpperCase() + mapped.slice(1);
    }
  });
  return out;
}

export function foldForSearch(text: string): string {
  return toLatin(text)
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}
