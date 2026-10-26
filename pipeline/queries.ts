const SELECT =
  '?item ?code ?coord ?image ?labelSr ?labelSrEl ?labelEn ?labelSq ?type ?typeSr ?typeEn ?partOf ?srwiki ?enwiki';

function tail(): string {
  return `
  ?item wdt:P17 ?country. VALUES ?country { wd:Q403 wd:Q1246 }
  OPTIONAL { ?item wdt:P625 ?coord. }
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?item rdfs:label ?labelSr. FILTER(LANG(?labelSr) = "sr") }
  OPTIONAL { ?item rdfs:label ?labelSrEl. FILTER(LANG(?labelSrEl) = "sr-el") }
  OPTIONAL { ?item rdfs:label ?labelEn. FILTER(LANG(?labelEn) = "en") }
  OPTIONAL { ?item rdfs:label ?labelSq. FILTER(LANG(?labelSq) = "sq") }
  OPTIONAL { ?item wdt:P31 ?type.
    OPTIONAL { ?type rdfs:label ?typeSr. FILTER(LANG(?typeSr) = "sr") }
    OPTIONAL { ?type rdfs:label ?typeEn. FILTER(LANG(?typeEn) = "en") } }
  OPTIONAL { ?item wdt:P361 ?partOf. }
  OPTIONAL { ?srwiki schema:about ?item; schema:isPartOf <https://sr.wikipedia.org/>. }
  OPTIONAL { ?enwiki schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }`;
}

function values(qids: string[]): string {
  return qids.map((q) => `wd:${q}`).join(' ');
}

// Items in Serbia / Kosovo carrying one of the given heritage designations (P1435).
export function designatedItemsQuery(designationQids: string[]): string {
  return `SELECT ${SELECT} WHERE {
  VALUES ?code { ${values(designationQids)} }
  ?item wdt:P1435 ?code.${tail()}
}`;
}

// Items in Serbia / Kosovo that are instances (P31) of the given nature-area classes.
export function natureClassQuery(classQids: string[]): string {
  return `SELECT ${SELECT} WHERE {
  VALUES ?code { ${values(classQids)} }
  ?item wdt:P31 ?code.${tail()}
}`;
}
