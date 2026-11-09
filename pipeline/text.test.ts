import { describe, expect, it } from 'vitest';
import { cleanText, fixMixedScript, tidySpacing, restoreDiacritics } from './text';

describe('fixMixedScript', () => {
  it('turns Latin look-alikes inside a Cyrillic word into Cyrillic', () => {
    expect(fixMixedScript('Национални парк Стара планинa')).toBe('Национални парк Стара планина');
    expect(fixMixedScript('Kућа грађевинара')).toBe('Кућа грађевинара');
    expect(fixMixedScript('Светог Николaja')).toBe('Светог Николаја');
  });

  it('turns Cyrillic look-alikes inside a Latin word into Latin', () => {
    expect(fixMixedScript('Оld village cemetery in Rajac')).toBe('Old village cemetery in Rajac');
    expect(fixMixedScript('Church of Saint George in Rečanе')).toBe('Church of Saint George in Rečane');
    expect(fixMixedScript('Тombstone to Tomа Sandulović')).toBe('Tombstone to Toma Sandulović');
  });

  it('decides a word made only of look-alikes by the rest of the text', () => {
    expect(fixMixedScript('Кameni kip')).toBe('Kameni kip');
    expect(fixMixedScript('Мaр о')).toBe('Мар о');
  });

  it('leaves clean text and genuinely non-look-alike mixes alone', () => {
    expect(fixMixedScript('Манастир Студеница')).toBe('Манастир Студеница');
    expect(fixMixedScript('Studenica monastery')).toBe('Studenica monastery');
    expect(fixMixedScript('Ђавоља варош (Đavolja Varoš)')).toBe('Ђавоља варош (Đavolja Varoš)');
  });
});

describe('tidySpacing', () => {
  it('removes spaces before punctuation and collapses runs of spaces', () => {
    expect(tidySpacing('листи Светске баштине .')).toBe('листи Светске баштине.');
    expect(tidySpacing('заселак Милачићи , насељеном')).toBe('заселак Милачићи, насељеном');
    expect(tidySpacing('a  b\t c')).toBe('a b c');
    expect(tidySpacing('( 1196 ) и ( нешто)')).toBe('(1196) и (нешто)');
  });

  it('keeps paragraph breaks but trims around them', () => {
    expect(tidySpacing('Први .  \n  Други.')).toBe('Први.\nДруги.');
  });
});

describe('cleanText', () => {
  it('does both', () => {
    expect(cleanText('Kућа  у Београду .')).toBe('Кућа у Београду.');
  });

  it('repairs Wikipedia templates that leaked into the text', () => {
    expect(cleanText('Просечна температура у пећини је 8Шаблон:Celsius.')).toBe('Просечна температура у пећини је 8 °C.');
    expect(cleanText('About 12 Template:Celsius here.')).toBe('About 12 °C here.');
    expect(cleanText('Нешто Шаблон:Непознат овде.')).toBe('Нешто овде.');
  });
});

describe('restoreDiacritics', () => {
  it('puts back the letters an English name lost, taking them from the Serbian name', () => {
    expect(restoreDiacritics('Sid Municipality', 'Шид')).toBe('Šid Municipality');
    expect(restoreDiacritics('Backa Topola Municipality', 'Бачка Топола')).toBe('Bačka Topola Municipality');
    // a shared stem is enough: "Sumadija" and "Šumadijski" differ only after the stem
    expect(restoreDiacritics('Sumadija Administrative District', 'Шумадијски округ')).toBe('Šumadija Administrative District');
    expect(restoreDiacritics('Raska Administrative District', 'Рашки округ')).toBe('Raška Administrative District');
    expect(restoreDiacritics('City of Nis', 'Ниш')).toBe('City of Niš');
  });
  it('leaves names that already have them, or that differ, alone', () => {
    expect(restoreDiacritics('City of Kragujevac', 'Крагујевац')).toBe('City of Kragujevac');
    expect(restoreDiacritics('Šid Municipality', 'Шид')).toBe('Šid Municipality');
    expect(restoreDiacritics(undefined, 'Шид')).toBeUndefined();
    expect(restoreDiacritics('Danube', 'Дунав')).toBe('Danube');
  });
});
