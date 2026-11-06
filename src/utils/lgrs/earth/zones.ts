import {
  MGRS_BAND_HEIGHT_DEGREES,
  MGRS_LATITUDE_BAND_LETTERS,
  UPS_FALSE_EASTING,
  UTM_MAX_LATITUDE,
  UTM_MIN_LATITUDE,
  UTM_ZONE_COUNT,
  UTM_ZONE_WIDTH_DEGREES,
} from "./constants";

/**
 * Earth CRS ids and zone classification. Ids follow the lunar pattern: 0 = UPS S, 1 = UPS N,
 * 2 + (zone − 1)·2 + (S ? 1 : 0) = UTM zone 1–60, −1 = invalid. All boundaries are half-open
 * and exact on the input lat/lon, with no snapping.
 */

export const EARTH_CRS_INVALID: LgrsCrsId = -1;
export const EARTH_CRS_UPS_SOUTH: LgrsCrsId = 0;
export const EARTH_CRS_UPS_NORTH: LgrsCrsId = 1;
const UTM_CRS_FIRST = 2;
const UTM_CRS_LAST = UTM_CRS_FIRST + UTM_ZONE_COUNT * 2 - 1;

const CRS_NAMES: string[] = ["UPS S", "UPS N"];
for (let zone = 1; zone <= UTM_ZONE_COUNT; zone++) CRS_NAMES.push(`${zone}N`, `${zone}S`);

/** Conform a longitude to [-180, 180) exactly (values already in range are kept). */
export function conformEarthLongitude(lon: number): number {
  if (lon >= -180 && lon < 180) return lon;
  let conformed = lon % 360;
  if (conformed >= 180) conformed -= 360;
  else if (conformed < -180) conformed += 360;
  return conformed;
}

/** Standard 6° zone (1–60) of a longitude in [-180, 180), exact at the zone meridians. */
function getStandardUtmZone(conformedLon: number): number {
  let zone = Math.floor((conformedLon + 180) / UTM_ZONE_WIDTH_DEGREES) + 1;
  const west = (zone - 1) * UTM_ZONE_WIDTH_DEGREES - 180;
  if (conformedLon < west) zone -= 1;
  else if (conformedLon >= west + UTM_ZONE_WIDTH_DEGREES) zone += 1;
  return zone;
}

/** UTM zone of a point with lat in [-80, 84) and lon in [-180, 180), with the exceptions. */
function getUtmZoneForLatLon(lat: number, conformedLon: number): number {
  if (lat >= 56 && lat < 64) {
    if (conformedLon >= 3 && conformedLon < 12) return 32;
  } else if (lat >= 72) {
    if (conformedLon >= 0 && conformedLon < 42) {
      if (conformedLon < 9) return 31;
      if (conformedLon < 21) return 33;
      if (conformedLon < 33) return 35;
      return 37;
    }
  }
  return getStandardUtmZone(conformedLon);
}

/**
 * The Earth CRS owning a point: UPS S below 80° S, UPS N at or above 84° N, otherwise the UTM
 * zone (with the Norway and Svalbard exceptions) and hemisphere (N iff lat ≥ 0). Invalid unless
 * lat is in [-90, 90] and lon is finite.
 */
export function classifyEarthLatLon(lat: number, lon: number): LgrsCrsId {
  if (!(lat >= -90 && lat <= 90) || !Number.isFinite(lon)) return EARTH_CRS_INVALID;
  if (lat < UTM_MIN_LATITUDE) return EARTH_CRS_UPS_SOUTH;
  if (lat >= UTM_MAX_LATITUDE) return EARTH_CRS_UPS_NORTH;
  const zone = getUtmZoneForLatLon(lat, conformEarthLongitude(lon));
  return UTM_CRS_FIRST + (zone - 1) * 2 + (lat < 0 ? 1 : 0);
}

export function isValidEarthCrs(crs: LgrsCrsId): boolean {
  return Number.isInteger(crs) && crs >= 0 && crs <= UTM_CRS_LAST;
}

export function isUpsCrs(crs: LgrsCrsId): boolean {
  return crs === EARTH_CRS_UPS_SOUTH || crs === EARTH_CRS_UPS_NORTH;
}

export function isUtmCrs(crs: LgrsCrsId): boolean {
  return Number.isInteger(crs) && crs >= UTM_CRS_FIRST && crs <= UTM_CRS_LAST;
}

export function isSouthEarthCrs(crs: LgrsCrsId): boolean {
  return crs === EARTH_CRS_UPS_SOUTH || (isUtmCrs(crs) && (crs - UTM_CRS_FIRST) % 2 === 1);
}

/** UTM zone number (1–60), or 0 for UPS/invalid ids. */
export function getUtmZone(crs: LgrsCrsId): number {
  return isUtmCrs(crs) ? Math.floor((crs - UTM_CRS_FIRST) / 2) + 1 : 0;
}

export function getUtmCrsId(zone: number, hemisphere: LgrsHemisphere): LgrsCrsId {
  if (!Number.isInteger(zone) || zone < 1 || zone > UTM_ZONE_COUNT) return EARTH_CRS_INVALID;
  return UTM_CRS_FIRST + (zone - 1) * 2 + (hemisphere === "S" ? 1 : 0);
}

export function getUpsCrsId(hemisphere: LgrsHemisphere): LgrsCrsId {
  return hemisphere === "S" ? EARTH_CRS_UPS_SOUTH : EARTH_CRS_UPS_NORTH;
}

/** Central meridian (degrees) of a UTM zone. */
export function getUtmCentralMeridian(zone: number): number {
  return (zone - 1) * UTM_ZONE_WIDTH_DEGREES - 177;
}

/** `"15N"`, `"4S"`, `"UPS S"`, `"UPS N"`, or `""` for an invalid id. */
export function formatEarthCrsName(crs: LgrsCrsId): string {
  return isValidEarthCrs(crs) ? CRS_NAMES[crs] : "";
}

/** Band index 0–19 (C–X) for lat in [-80, 84), exact at the band parallels. */
function getBandIndex(lat: number): number {
  let index = Math.floor(lat / MGRS_BAND_HEIGHT_DEGREES);
  // lat / 8 can underflow to -0 for subnormal negative lat.
  if (index * MGRS_BAND_HEIGHT_DEGREES > lat) index -= 1;
  index += 10;
  return index > 19 ? 19 : index;
}

/** MGRS latitude band letter (C–X) owning `[south, north)`, or `""` outside [-80, 84). */
export function getEarthLatitudeBandLetter(lat: number): string {
  if (!(lat >= UTM_MIN_LATITUDE && lat < UTM_MAX_LATITUDE)) return "";
  return MGRS_LATITUDE_BAND_LETTERS[getBandIndex(lat)];
}

/** UPS band letter from the easting (A/Y west of the false easting, B/Z at or east of it). */
export function getUpsBandLetter(crs: LgrsCrsId, e: number): string {
  if (crs === EARTH_CRS_UPS_SOUTH) return e < UPS_FALSE_EASTING ? "A" : "B";
  if (crs === EARTH_CRS_UPS_NORTH) return e < UPS_FALSE_EASTING ? "Y" : "Z";
  return "";
}

/** Whether `crs` owns the point (≡ `classifyEarthLatLon(lat, lon) === crs`). */
export function isInEarthRegion(lat: number, lon: number, crs: LgrsCrsId): boolean {
  return crs >= 0 && classifyEarthLatLon(lat, lon) === crs;
}

/**
 * Latitude limits of a CRS region: UTM N `[0, 84)`, UTM S `[-80, 0)`, UPS N `[84, 90]`,
 * UPS S `[-90, -80)`.
 */
export function getEarthCrsLatitudeLimits(crs: LgrsCrsId): [south: number, north: number] {
  if (crs === EARTH_CRS_UPS_SOUTH) return [-90, UTM_MIN_LATITUDE];
  if (crs === EARTH_CRS_UPS_NORTH) return [UTM_MAX_LATITUDE, 90];
  return isSouthEarthCrs(crs) ? [UTM_MIN_LATITUDE, 0] : [0, UTM_MAX_LATITUDE];
}

function slice(south: number, north: number, west: number, east: number): EarthRegionSlice {
  return Object.freeze({ south, north, west, east });
}

/** Northern-hemisphere slices of the zones changed by the Norway and Svalbard exceptions. */
const EXCEPTION_NORTH_SLICES: Record<number, readonly EarthRegionSlice[]> = {
  31: [slice(0, 56, 0, 6), slice(56, 64, 0, 3), slice(64, 72, 0, 6), slice(72, 84, 0, 9)],
  32: [slice(0, 56, 6, 12), slice(56, 64, 3, 12), slice(64, 72, 6, 12)],
  33: [slice(0, 72, 12, 18), slice(72, 84, 9, 21)],
  34: [slice(0, 72, 18, 24)],
  35: [slice(0, 72, 24, 30), slice(72, 84, 21, 33)],
  36: [slice(0, 72, 30, 36)],
  37: [slice(0, 72, 36, 42), slice(72, 84, 33, 42)],
};

const REGION_SLICES: (readonly EarthRegionSlice[])[] = [
  Object.freeze([slice(-90, UTM_MIN_LATITUDE, -180, 180)]),
  Object.freeze([slice(UTM_MAX_LATITUDE, 90, -180, 180)]),
];
for (let zone = 1; zone <= UTM_ZONE_COUNT; zone++) {
  const west = (zone - 1) * UTM_ZONE_WIDTH_DEGREES - 180;
  const east = west + UTM_ZONE_WIDTH_DEGREES;
  REGION_SLICES.push(
    Object.freeze(EXCEPTION_NORTH_SLICES[zone] ?? [slice(0, UTM_MAX_LATITUDE, west, east)]),
    Object.freeze([slice(UTM_MIN_LATITUDE, 0, west, east)])
  );
}

/**
 * The lat/lon rectangles a CRS owns, south to north (one per exception slice), or `[]` for an
 * invalid id. Their union is exactly the set `classifyEarthLatLon` assigns to `crs`.
 */
export function getEarthRegionSlices(crs: LgrsCrsId): readonly EarthRegionSlice[] {
  return isValidEarthCrs(crs) ? REGION_SLICES[crs] : [];
}

/**
 * `[west, east)` longitude limits of `crs` at latitude `lat`, including the exception slices, or
 * null when `crs` owns nothing at that latitude (e.g. zone 32 in band X).
 */
export function getEarthZoneLongitudeLimits(
  crs: LgrsCrsId,
  lat: number
): [west: number, east: number] | null {
  for (const s of getEarthRegionSlices(crs)) {
    if (lat >= s.south && (lat < s.north || (s.north === 90 && lat === 90))) {
      return [s.west, s.east];
    }
  }
  return null;
}
