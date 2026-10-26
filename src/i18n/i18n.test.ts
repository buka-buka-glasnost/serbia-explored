import { describe, expect, it } from 'vitest';
import type { AreaProps, Place } from '../shared/types';
import { STRINGS, type StringKey } from './strings';
import { areaName, detectLang, placeDescription, placeName, t } from './i18n';

const base: Place = {
  id: 'Q1', nameSr: 'Пећка патријаршија', kind: 'culture', tier: 1, designations: [],
  lat: 42.67, lon: 20.31, districtId: null, municipalityId: null, inKosovo: true, access: null,
};

describe('i18n', () => {
  it('names Kosovo places with the Albanian name in English', () => {
    const p = { ...base, nameSq: 'Patrikana e Pejës' };
    expect(placeName(p, 'en')).toBe('Pećka patrijaršija / Patrikana e Pejës');
    expect(placeName(p, 'sr-Cyrl')).toBe('Пећка патријаршија');
    expect(placeName(p, 'sr-Latn')).toBe('Pećka patrijaršija');
  });
  it('uses nameEn for ordinary places and falls back to Latin', () => {
    const p = { ...base, inKosovo: false, nameEn: 'Studenica Monastery' };
    expect(placeName(p, 'en')).toBe('Studenica Monastery');
    expect(placeName({ ...p, nameEn: undefined }, 'en')).toBe('Pećka patrijaršija');
  });
  it('skips the Albanian name when it equals the Serbian one', () => {
    expect(placeName({ ...base, nameSq: 'Pecka Patrijarsija' }, 'en')).toBe('Pećka patrijaršija');
  });
  it('names areas by the same rules', () => {
    const a: AreaProps = { id: 'a', level: 'municipality', nameSr: 'Пећ', inKosovo: true, nameSq: 'Pejë' };
    expect(areaName(a, 'en')).toBe('Peć / Pejë');
    expect(areaName({ ...a, inKosovo: false, nameEn: 'Pec' }, 'en')).toBe('Pec');
  });
  it('flags untranslated English descriptions', () => {
    const p = { ...base, descSr: 'Манастир из 13. века.' };
    expect(placeDescription(p, 'en')).toEqual({ text: 'Manastir iz 13. veka.', untranslated: true });
    expect(placeDescription(p, 'sr-Cyrl')).toEqual({ text: 'Манастир из 13. века.', untranslated: false });
    expect(placeDescription(p, 'sr-Latn')?.text).toBe('Manastir iz 13. veka.');
    expect(placeDescription({ ...p, descEn: 'A monastery.' }, 'en')).toEqual({ text: 'A monastery.', untranslated: false });
    expect(placeDescription(base, 'en')).toBeNull();
  });
  it('detects language', () => {
    expect(detectLang('sr-RS')).toBe('sr-Cyrl');
    expect(detectLang('sr')).toBe('sr-Cyrl');
    expect(detectLang('de-DE')).toBe('en');
    expect(detectLang(undefined)).toBe('en');
  });
  it('translates strings', () => {
    expect(t('appTitle', 'en')).toBe('Serbia Explored');
    expect(t('appTitle', 'sr-Latn')).toBe('Srbija — istraženo');
  });
  it('has non-empty sr and en for every key', () => {
    for (const k of Object.keys(STRINGS) as StringKey[]) {
      expect(STRINGS[k].sr.trim(), k).not.toBe('');
      expect(STRINGS[k].en.trim(), k).not.toBe('');
    }
  });
  it('pins the English access labels', () => {
    expect(STRINGS.accessDoor.en).toBe('Drive to the door');
    expect(STRINGS.accessRough.en).toBe('Rough road');
    expect(STRINGS.accessHikeBoat.en).toBe('Hike / boat only');
    expect(STRINGS.accessUnknown.en).toBe('Information not available yet');
  });
  it('includes the keys other tasks rely on', () => {
    const keys = ['tripFull', 'alreadyInTrip', 'storageError', 'storageUnavailableBanner', 'tooManyPhotos',
      'importDone', 'importInvalid', 'kosovoNote', 'notTranslated', 'accessUnknown', 'accessDoor',
      'accessRough', 'accessHikeBoat', 'tier1', 'tier2', 'tier3', 'tier4', 'culture', 'nature',
      'designation_unesco_whs', 'designation_unesco_whs_part', 'designation_unesco_geopark',
      'designation_unesco_biosphere', 'designation_heritage_exceptional', 'designation_national_park',
      'designation_unesco_tentative', 'designation_heritage_great', 'designation_special_nature_reserve',
      'designation_ramsar', 'designation_heritage_protected', 'designation_nature_other'];
    for (const k of keys) expect(STRINGS, k).toHaveProperty(k);
  });
});
