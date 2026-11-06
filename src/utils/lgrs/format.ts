import {
  ACC_1KM_LETTERS,
  LGRS_AREA_METERS,
  LPS_DOMAIN_RADIUS,
  LPS_DOMAIN_TOLERANCE_METERS,
  LPS_EASTING_AREA_LETTERS,
  LPS_FALSE_EASTING,
  LPS_FALSE_NORTHING,
  LPS_NORTHING_AREA_LETTERS,
  LTM_DOMAIN_TOLERANCE_DEGREES,
  LTM_EASTING_AREA_LETTERS,
  LTM_FALSE_NORTHING_SOUTH,
  LTM_LATITUDE_BAND_LETTERS,
  LTM_MAX_ABS_LATITUDE,
  LTM_NORTHING_AREA_LETTER_SETS,
  LTM_ZONE_WIDTH_DEGREES,
} from "./constants";
import {
  classifyLatLon,
  getLtmZone,
  getLtmZoneWestLongitude,
  isSouthCrs,
  LGRS_CRS_LPS_NORTH,
  LGRS_CRS_LPS_SOUTH,
} from "./crs";
import { projectLatLon, unprojectToLatLon } from "./projection";

/**
 * LGRS / ACC strings for projected coordinates (`lgrs` `LpsPoint._to_lgrs` / `LtmPoint._to_lgrs`).
 * `formatLgrs` labels a point; `formatLgrsLabel` labels the box containing it.
 */

const DIGITS_1: string[] = [];
const DIGITS_2: string[] = [];
const DIGITS_3: string[] = [];
for (let value = 0; value < 1000; value++) {
  if (value < 10) DIGITS_1.push(String(value));
  if (value < 100) DIGITS_2.push(value < 10 ? `0${value}` : String(value));
  DIGITS_3.push(value < 10 ? `00${value}` : value < 100 ? `0${value}` : String(value));
}

const ZONE_NAMES: string[] = [""];
for (let zone = 1; zone <= 45; zone++) ZONE_NAMES.push(String(zone));

const LPS_DOMAIN_LIMIT = LPS_DOMAIN_RADIUS + LPS_DOMAIN_TOLERANCE_METERS;

/** Zero-padded `value` (0 ≤ value < 10^count) with `count` digits. */
function fixedDigits(value: number, count: number): string {
  switch (count) {
    case 1:
      return DIGITS_1[value];
    case 2:
      return DIGITS_2[value];
    case 3:
      return DIGITS_3[value];
    case 4:
      return DIGITS_2[Math.floor(value / 100)] + DIGITS_2[value % 100];
    case 5:
      return DIGITS_2[Math.floor(value / 1000)] + DIGITS_3[value % 1000];
    default:
      return "";
  }
}

function digitCount(precision: LgrsPrecision): number {
  switch (precision) {
    case 1:
      return 5;
    case 10:
      return 4;
    case 100:
      return 3;
    case 1000:
      return 2;
    default:
      return 0;
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Python float `%` for a positive divisor. */
function pythonModulo(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

/** Python float `//` consistent with `pythonModulo`. */
function pythonFloorDivide(value: number, divisor: number, remainder: number): number {
  const quotient = (value - remainder) / divisor;
  const floored = Math.floor(quotient);
  return quotient - floored > 0.5 ? floored + 1 : floored;
}

// Scratch outputs of the parts computation (single-threaded, no allocation).
let partPrefix = "";
let partEasting = 0;
let partNorthing = 0;
const scratch = new Float64Array(2);

function isInLpsDomain(e: number, n: number): boolean {
  return Math.hypot(e - LPS_FALSE_EASTING, n - LPS_FALSE_NORTHING) <= LPS_DOMAIN_LIMIT;
}

function computeLpsParts(e: number, n: number, south: boolean): boolean {
  const adjustedEasting = e - LPS_FALSE_EASTING;
  const adjustedNorthing = n - LPS_FALSE_NORTHING;
  const isWestHalf = e < LPS_FALSE_EASTING;
  let eastingAreaIndex = isWestHalf
    ? 23 - Math.floor(Math.abs(adjustedEasting) / LGRS_AREA_METERS)
    : Math.floor(adjustedEasting / LGRS_AREA_METERS);
  let withinEasting = Math.floor(
    isWestHalf
      ? LGRS_AREA_METERS - positiveModulo(Math.abs(adjustedEasting), LGRS_AREA_METERS)
      : positiveModulo(adjustedEasting, LGRS_AREA_METERS)
  );
  if (withinEasting >= LGRS_AREA_METERS) {
    // A west-half point exactly on a 25 km line starts the next area.
    eastingAreaIndex += 1;
    withinEasting = 0;
  }
  const eastingArea = LPS_EASTING_AREA_LETTERS[eastingAreaIndex];
  const northingArea =
    LPS_NORTHING_AREA_LETTERS[Math.floor(adjustedNorthing / LGRS_AREA_METERS) + 13];
  if (!eastingArea || !northingArea) return false;

  const band = south ? (isWestHalf ? "A" : "B") : isWestHalf ? "Y" : "Z";
  partPrefix = band + eastingArea + northingArea;
  partEasting = withinEasting;
  partNorthing = Math.floor(positiveModulo(adjustedNorthing, LGRS_AREA_METERS));
  return true;
}

function computeLtmParts(e: number, n: number, crs: LgrsCrsId, bandIndex: number): boolean {
  const zone = getLtmZone(crs);
  const bandLetter = LTM_LATITUDE_BAND_LETTERS[bandIndex];

  const eastingRemainder = pythonModulo(e, LGRS_AREA_METERS);
  let eastingAreaIndex = pythonFloorDivide(e, LGRS_AREA_METERS, eastingRemainder) - 5;
  let withinEasting = Math.floor(eastingRemainder);
  if (withinEasting >= LGRS_AREA_METERS) {
    eastingAreaIndex += 1;
    withinEasting = 0;
  }
  const northingRemainder = pythonModulo(n, LGRS_AREA_METERS);
  let northingAreaIndex = pythonFloorDivide(n, LGRS_AREA_METERS, northingRemainder);
  let withinNorthing = Math.floor(northingRemainder);
  if (withinNorthing >= LGRS_AREA_METERS) {
    northingAreaIndex += 1;
    withinNorthing = 0;
  }
  const eastingArea = LTM_EASTING_AREA_LETTERS[eastingAreaIndex];
  const northingArea =
    LTM_NORTHING_AREA_LETTER_SETS[(zone - 1) % 3][positiveModulo(northingAreaIndex, 20)];
  if (!bandLetter || !eastingArea || !northingArea) return false;

  partPrefix = ZONE_NAMES[zone] + bandLetter + eastingArea + northingArea;
  partEasting = withinEasting;
  partNorthing = withinNorthing;
  return true;
}

/**
 * LTM region membership of a point with inverse lat/lon `[lat, lon]` and northing `n`. The
 * hemisphere is strict (N: n ≥ 0 and lat ≥ 0; S: n < 2,500,000 and lat < 0); the ±80° parallel
 * and the zone meridians are inclusive and padded by `tolerance` degrees.
 */
function isInLtmRegion(
  lat: number,
  lon: number,
  n: number,
  crs: LgrsCrsId,
  tolerance: number
): boolean {
  if (isSouthCrs(crs)) {
    if (!(n < LTM_FALSE_NORTHING_SOUTH && lat < 0 && lat >= -LTM_MAX_ABS_LATITUDE - tolerance)) {
      return false;
    }
  } else if (!(n >= 0 && lat >= 0 && lat <= LTM_MAX_ABS_LATITUDE + tolerance)) {
    return false;
  }
  const west = getLtmZoneWestLongitude(getLtmZone(crs));
  let offset = lon - west;
  if (offset < -180) offset += 360;
  else if (offset >= 180) offset -= 360;
  return offset >= -tolerance && offset <= LTM_ZONE_WIDTH_DEGREES + tolerance;
}

function getLatitudeBandIndex(lat: number): number {
  return Math.floor(lat / 8) + 11;
}

function buildString(precision: LgrsPrecision, kind: LgrsStringKind): string {
  const count = digitCount(precision);
  if (count === 0) return partPrefix;
  if (kind === "lgrs") {
    return (
      partPrefix +
      fixedDigits(Math.floor(partEasting / precision), count) +
      fixedDigits(Math.floor(partNorthing / precision), count)
    );
  }
  const residualCount = count - 2;
  return (
    partPrefix +
    ACC_1KM_LETTERS[Math.floor(partEasting / 1000)] +
    fixedDigits(Math.floor((partEasting % 1000) / precision), residualCount) +
    ACC_1KM_LETTERS[Math.floor(partNorthing / 1000)] +
    fixedDigits(Math.floor((partNorthing % 1000) / precision), residualCount)
  );
}

/**
 * LGRS or ACC string for the point `[e, n]` in `crs` (point semantics). `lat` is the point's
 * latitude, used for the LTM latitude band; when omitted it comes from the inverse projection.
 * Returns null outside the crs region: the LPS circle to ±80° (+1e-6 m); for LTM with `lat`
 * supplied, outside the hemisphere band N `[0, 80)` / S `(-80, 0)`; for LTM without `lat`, when
 * the inverse lat/lon fails the `isInLtmRegion` test.
 */
export function formatLgrs(
  e: number,
  n: number,
  crs: LgrsCrsId,
  precision: LgrsPrecision,
  kind: LgrsStringKind,
  lat?: number
): string | null {
  if (!Number.isFinite(e) || !Number.isFinite(n)) return null;
  if (crs === LGRS_CRS_LPS_SOUTH || crs === LGRS_CRS_LPS_NORTH) {
    if (!isInLpsDomain(e, n) || !computeLpsParts(e, n, crs === LGRS_CRS_LPS_SOUTH)) return null;
    return buildString(precision, kind);
  }
  if (getLtmZone(crs) === 0) return null;

  const south = isSouthCrs(crs);
  let bandIndex: number;
  if (lat === undefined) {
    if (!unprojectToLatLon(e, n, crs, scratch)) return null;
    if (!isInLtmRegion(scratch[0], scratch[1], n, crs, LTM_DOMAIN_TOLERANCE_DEGREES)) return null;
    bandIndex = getLatitudeBandIndex(scratch[0]);
  } else {
    if (
      south ? !(lat < 0 && lat > -LTM_MAX_ABS_LATITUDE) : !(lat >= 0 && lat < LTM_MAX_ABS_LATITUDE)
    ) {
      return null;
    }
    bandIndex = getLatitudeBandIndex(lat);
  }
  if (!computeLtmParts(e, n, crs, bandIndex)) return null;
  return buildString(precision, kind);
}

/**
 * Label of the `precision` box containing `[e, n]` (box semantics): the box's grid-southwest
 * corner is `floor(c / precision) · precision` and the label is computed at the box centre.
 * Returns null when `[e, n]` is outside the crs region: the LPS circle to ±80° (+1e-6 m), or for
 * LTM when its inverse lat/lon fails the `isInLtmRegion` test (the box itself is not checked).
 */
export function formatLgrsLabel(
  e: number,
  n: number,
  crs: LgrsCrsId,
  precision: LgrsPrecision
): LgrsLabel | null {
  if (!Number.isFinite(e) || !Number.isFinite(n)) return null;
  const isLps = crs === LGRS_CRS_LPS_SOUTH || crs === LGRS_CRS_LPS_NORTH;
  if (isLps) {
    if (!isInLpsDomain(e, n)) return null;
  } else {
    if (getLtmZone(crs) === 0 || !unprojectToLatLon(e, n, crs, scratch)) return null;
    if (!isInLtmRegion(scratch[0], scratch[1], n, crs, LTM_DOMAIN_TOLERANCE_DEGREES)) return null;
  }

  const lowerLeft: LgrsCoordinate = [
    Math.floor(e / precision) * precision,
    Math.floor(n / precision) * precision,
  ];
  const sampleEasting = lowerLeft[0] + precision / 2;
  const sampleNorthing = lowerLeft[1] + precision / 2;
  if (isLps) {
    if (!computeLpsParts(sampleEasting, sampleNorthing, crs === LGRS_CRS_LPS_SOUTH)) return null;
  } else {
    if (!unprojectToLatLon(sampleEasting, sampleNorthing, crs, scratch)) return null;
    const bandIndex = getLatitudeBandIndex(scratch[0]);
    if (!computeLtmParts(sampleEasting, sampleNorthing, crs, bandIndex)) return null;
  }

  const prefix = partPrefix;
  const lgrs = buildString(precision, "lgrs");
  if (precision === 25000) {
    return { lgrs, acc: prefix, prefix, condensed: "", text: prefix, lowerLeft, precision };
  }
  const acc = buildString(precision, "acc");
  const condensed = acc.slice(prefix.length);
  const half = condensed.length / 2;
  return {
    lgrs,
    acc,
    prefix,
    condensed,
    text: `${condensed.slice(0, half)} ${condensed.slice(half)}`,
    lowerLeft,
    precision,
  };
}

/** LGRS or ACC string for a lat/lon in its own (default M2025) CRS. */
export function formatLatLonAsLgrs(
  lat: number,
  lon: number,
  precision: LgrsPrecision,
  kind: LgrsStringKind
): string | null {
  const crs = classifyLatLon(lat, lon);
  if (crs < 0 || !projectLatLon(lat, lon, crs, scratch)) return null;
  return formatLgrs(scratch[0], scratch[1], crs, precision, kind, lat);
}
