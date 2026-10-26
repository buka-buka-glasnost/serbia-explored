// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { designatedItemsQuery, natureClassQuery } from './queries';

const COLUMNS =
  '?item ?code ?coord ?image ?labelSr ?labelSrEl ?labelEn ?labelSq ?type ?typeSr ?typeEn ?partOf ?srwiki ?enwiki';

describe('query builders', () => {
  it('designatedItemsQuery selects all columns and joins on P1435', () => {
    const q = designatedItemsQuery(['Q9259', 'Q43113623']);
    expect(q).toContain(`SELECT ${COLUMNS}`);
    expect(q).toContain('VALUES ?code { wd:Q9259 wd:Q43113623 }');
    expect(q).toContain('?item wdt:P1435 ?code');
    expect(q).toContain('VALUES ?country { wd:Q403 wd:Q1246 }');
    expect(q).toContain('wdt:P361 ?partOf');
    for (const lang of ["sr", "sr-el", "en", "sq"]) expect(q).toContain(`"${lang}"`);
    expect(q).not.toContain('SERVICE wikibase:label');
  });

  it('natureClassQuery joins on P31', () => {
    const q = natureClassQuery(['Q46169']);
    expect(q).toContain(`SELECT ${COLUMNS}`);
    expect(q).toContain('VALUES ?code { wd:Q46169 }');
    expect(q).toContain('?item wdt:P31 ?code');
  });
});
