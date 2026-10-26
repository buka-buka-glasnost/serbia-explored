import { describe, it, expect } from 'vitest';
import { toLatin, hasCyrillic, foldForSearch } from './translit';

describe('translit', () => {
  it('transliterates Cyrillic to Latin', () => {
    expect(toLatin('Ђавоља Варош')).toBe('Đavolja Varoš');
    expect(toLatin('Љубовија Њеш Џеп')).toBe('Ljubovija Nješ Džep');
    expect(toLatin('ЉУБОВИЈА')).toBe('LJUBOVIJA');
    expect(toLatin('Манастир Студеница')).toBe('Manastir Studenica');
    expect(toLatin('Studenica 1190')).toBe('Studenica 1190');
  });
  it('detects Cyrillic', () => {
    expect(hasCyrillic('Peć')).toBe(false);
    expect(hasCyrillic('Пећ')).toBe(true);
  });
  it('folds for search', () => {
    expect(foldForSearch('Đavolja')).toBe('djavolja');
    expect(foldForSearch('Ђавоља')).toBe('djavolja');
    expect(foldForSearch('ČAČAK žić ć')).toBe('cacak zic c');
  });
});
