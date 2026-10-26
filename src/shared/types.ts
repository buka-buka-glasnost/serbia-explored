export type Lang = 'sr-Cyrl' | 'sr-Latn' | 'en';
export type Tier = 1 | 2 | 3 | 4;
export type PlaceKind = 'culture' | 'nature';
export type Access = 'door' | 'rough' | 'hike_boat';
export type Designation =
  | 'unesco_whs' | 'unesco_whs_part' | 'unesco_geopark' | 'unesco_biosphere'
  | 'heritage_exceptional' | 'national_park' | 'unesco_tentative'
  | 'heritage_great' | 'special_nature_reserve' | 'ramsar'
  | 'heritage_protected' | 'nature_other';
export interface LatLon { lat: number; lon: number }
export interface Photo { url: string; file: string; author: string; license: string; sourceUrl: string }
export interface Place {
  id: string;                 // Wikidata QID, or "x-<slug>" for manual places
  nameSr: string;             // Cyrillic where available, else as found
  nameEn?: string; nameSq?: string;
  typeSr?: string; typeEn?: string;
  kind: PlaceKind; tier: Tier; designations: Designation[];
  partOf?: { id: string; nameSr: string; nameEn?: string };
  lat: number; lon: number;
  districtId: string | null; municipalityId: string | null; inKosovo: boolean;
  photo?: Photo; descSr?: string; descEn?: string;
  access: Access | null;
  wikipediaSr?: string; wikipediaEn?: string;
}
export interface AreaProps {
  id: string; level: 'district' | 'municipality';
  nameSr: string; nameSq?: string; nameEn?: string;
  districtId?: string; inKosovo: boolean;
}
export interface PlacesFile { generatedAt: string; places: Place[] }
export type AreaFC = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProps>;
