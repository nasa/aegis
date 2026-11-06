import { LTM_MAX_ABS_LATITUDE, LTM_ZONE_COUNT, LTM_ZONE_WIDTH_DEGREES } from "./constants";

export const LGRS_CRS_INVALID: LgrsCrsId = -1;
export const LGRS_CRS_LPS_SOUTH: LgrsCrsId = 0;
export const LGRS_CRS_LPS_NORTH: LgrsCrsId = 1;
const LTM_CRS_FIRST = 2;
const LTM_CRS_LAST = LTM_CRS_FIRST + LTM_ZONE_COUNT * 2 - 1;

const CRS_NAMES: string[] = ["LPS S", "LPS N"];
for (let zone = 1; zone <= LTM_ZONE_COUNT; zone++) CRS_NAMES.push(`${zone}N`, `${zone}S`);

/** Conform a longitude to [-180, 180) the way `lgrs` does (values already in range are kept). */
export function conformLongitude(lon: number): number {
  if (lon >= -180 && lon < 180) return lon;
  let conformed = lon % 360;
  if (conformed < 0) conformed += 360;
  if (conformed >= 180) conformed -= 360;
  return conformed;
}

/** LTM zone (1–45) of a longitude in [-180, 180). */
export function getLtmZoneForLongitude(conformedLon: number): number {
  const zone = Math.trunc((conformedLon + 180) / LTM_ZONE_WIDTH_DEGREES + 1);
  return zone > LTM_ZONE_COUNT ? LTM_ZONE_COUNT : zone;
}

/**
 * Default M2025 partition: |lat| < 80 → LTM zone/hemisphere, else LPS. N iff lat ≥ 0.
 * Invalid (like `lgrs`) unless lat is in [-90, 90] and lon in [-360, 360].
 */
export function classifyLatLon(lat: number, lon: number): LgrsCrsId {
  if (!(lat >= -90 && lat <= 90) || !(lon >= -360 && lon <= 360)) return LGRS_CRS_INVALID;
  const south = lat < 0;
  if ((south ? -lat : lat) >= LTM_MAX_ABS_LATITUDE) {
    return south ? LGRS_CRS_LPS_SOUTH : LGRS_CRS_LPS_NORTH;
  }
  return LTM_CRS_FIRST + (getLtmZoneForLongitude(conformLongitude(lon)) - 1) * 2 + (south ? 1 : 0);
}

export function getLtmCrsId(zone: number, hemisphere: LgrsHemisphere): LgrsCrsId {
  if (!Number.isInteger(zone) || zone < 1 || zone > LTM_ZONE_COUNT) return LGRS_CRS_INVALID;
  return LTM_CRS_FIRST + (zone - 1) * 2 + (hemisphere === "S" ? 1 : 0);
}

export function getLpsCrsId(hemisphere: LgrsHemisphere): LgrsCrsId {
  return hemisphere === "S" ? LGRS_CRS_LPS_SOUTH : LGRS_CRS_LPS_NORTH;
}

export function isValidCrs(crs: LgrsCrsId): boolean {
  return Number.isInteger(crs) && crs >= 0 && crs <= LTM_CRS_LAST;
}

export function isLpsCrs(crs: LgrsCrsId): boolean {
  return crs === LGRS_CRS_LPS_SOUTH || crs === LGRS_CRS_LPS_NORTH;
}

export function isLtmCrs(crs: LgrsCrsId): boolean {
  return Number.isInteger(crs) && crs >= LTM_CRS_FIRST && crs <= LTM_CRS_LAST;
}

export function isSouthCrs(crs: LgrsCrsId): boolean {
  return crs === LGRS_CRS_LPS_SOUTH || (isLtmCrs(crs) && (crs - LTM_CRS_FIRST) % 2 === 1);
}

export function getCrsHemisphere(crs: LgrsCrsId): LgrsHemisphere {
  return isSouthCrs(crs) ? "S" : "N";
}

/** LTM zone number (1–45), or 0 for LPS/invalid ids. */
export function getLtmZone(crs: LgrsCrsId): number {
  return isLtmCrs(crs) ? Math.floor((crs - LTM_CRS_FIRST) / 2) + 1 : 0;
}

/** Central meridian (degrees) of an LTM zone. */
export function getLtmCentralMeridian(zone: number): number {
  return (zone - 1) * LTM_ZONE_WIDTH_DEGREES - 176;
}

/** Western (inclusive) longitude limit of an LTM zone; the eastern limit is this + 8. */
export function getLtmZoneWestLongitude(zone: number): number {
  return (zone - 1) * LTM_ZONE_WIDTH_DEGREES - 180;
}

/** `[west, east)` longitude limits of an LTM zone. */
export function getLtmZoneLongitudeLimits(zone: number): [west: number, east: number] {
  const west = getLtmZoneWestLongitude(zone);
  return [west, west + LTM_ZONE_WIDTH_DEGREES];
}

/**
 * Latitude limits of a CRS region: LTM N `[0, 80)`, LTM S `[-80, 0)`, LPS N `[80, 90]`,
 * LPS S `[-90, -80]`.
 */
export function getCrsLatitudeLimits(crs: LgrsCrsId): [min: number, max: number] {
  if (crs === LGRS_CRS_LPS_SOUTH) return [-90, -LTM_MAX_ABS_LATITUDE];
  if (crs === LGRS_CRS_LPS_NORTH) return [LTM_MAX_ABS_LATITUDE, 90];
  return isSouthCrs(crs) ? [-LTM_MAX_ABS_LATITUDE, 0] : [0, LTM_MAX_ABS_LATITUDE];
}

/** `"23N"`, `"4S"`, `"LPS S"`, `"LPS N"`, or `""` for an invalid id. */
export function formatCrsName(crs: LgrsCrsId): string {
  return isValidCrs(crs) ? CRS_NAMES[crs] : "";
}
