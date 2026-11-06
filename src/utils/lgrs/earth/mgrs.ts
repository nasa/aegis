import {
  MGRS_COLUMN_LETTER_SETS,
  MGRS_EVEN_ZONE_ROW_OFFSET,
  MGRS_ROW_LETTERS,
  MGRS_SQUARE_METERS,
  UPS_EAST_COLUMN_LETTERS,
  UPS_EAST_COLUMN_ORIGIN,
  UPS_FALSE_EASTING,
  UPS_NORTH_ROW_LETTERS,
  UPS_NORTH_ROW_ORIGIN,
  UPS_SOUTH_ROW_LETTERS,
  UPS_SOUTH_ROW_ORIGIN,
  UPS_WEST_COLUMN_LETTERS,
  UPS_WEST_COLUMN_ORIGIN,
  UTM_MAX_LATITUDE,
  UTM_MIN_LATITUDE,
  UTM_ZONE_COUNT,
} from "./constants";
import { fixedDigits } from "./digits";
import { projectEarthLatLon, unprojectEarthToLatLon } from "./projection";
import {
  classifyEarthLatLon,
  EARTH_CRS_UPS_NORTH,
  EARTH_CRS_UPS_SOUTH,
  getEarthLatitudeBandLetter,
  getUpsBandLetter,
  getUtmZone,
} from "./zones";

/**
 * MGRS 100 km square IDs and canonical MGRS strings. Digits are truncated (floor of the projected
 * E/N), and a box of size p owns `[k·p, (k+1)·p)` on each axis.
 */

const ZONE_NAMES: string[] = [""];
for (let zone = 1; zone <= UTM_ZONE_COUNT; zone++) ZONE_NAMES.push(String(zone));

/** UTM square IDs, indexed by ((zone − 1) % 3 · 2 + evenZone) · 160 + column · 20 + row. */
const UTM_SQUARE_IDS: string[] = [];
for (let set = 0; set < 3; set++) {
  for (let even = 0; even < 2; even++) {
    for (let column = 0; column < 8; column++) {
      for (let row = 0; row < 20; row++) {
        const rowIndex = (row + (even ? MGRS_EVEN_ZONE_ROW_OFFSET : 0)) % 20;
        UTM_SQUARE_IDS.push(MGRS_COLUMN_LETTER_SETS[set][column] + MGRS_ROW_LETTERS[rowIndex]);
      }
    }
  }
}

const UPS_WEST_COLUMN_OFFSET = UPS_WEST_COLUMN_ORIGIN / MGRS_SQUARE_METERS;
const UPS_EAST_COLUMN_OFFSET = UPS_EAST_COLUMN_ORIGIN / MGRS_SQUARE_METERS;
const UPS_SOUTH_ROW_OFFSET = UPS_SOUTH_ROW_ORIGIN / MGRS_SQUARE_METERS;
const UPS_NORTH_ROW_OFFSET = UPS_NORTH_ROW_ORIGIN / MGRS_SQUARE_METERS;

const parts: MgrsParts = { zoneBand: "", square: "", easting: 0, northing: 0 };
const scratch = new Float64Array(2);

/** Square letters and in-square metres of integer E/N `[ei, ni]`; false outside the tables. */
function computeSquare(crs: LgrsCrsId, ei: number, ni: number, out: MgrsParts): boolean {
  const columnIndex = Math.floor(ei / MGRS_SQUARE_METERS);
  const rowIndex = Math.floor(ni / MGRS_SQUARE_METERS);
  if (crs === EARTH_CRS_UPS_SOUTH || crs === EARTH_CRS_UPS_NORTH) {
    const column =
      ei < UPS_FALSE_EASTING
        ? UPS_WEST_COLUMN_LETTERS[columnIndex - UPS_WEST_COLUMN_OFFSET]
        : UPS_EAST_COLUMN_LETTERS[columnIndex - UPS_EAST_COLUMN_OFFSET];
    const row =
      crs === EARTH_CRS_UPS_SOUTH
        ? UPS_SOUTH_ROW_LETTERS[rowIndex - UPS_SOUTH_ROW_OFFSET]
        : UPS_NORTH_ROW_LETTERS[rowIndex - UPS_NORTH_ROW_OFFSET];
    if (!column || !row) return false;
    out.square = column + row;
  } else {
    const zone = getUtmZone(crs);
    const column = columnIndex - 1;
    if (zone === 0 || column < 0 || column > 7) return false;
    const row = ((rowIndex % 20) + 20) % 20;
    out.square =
      UTM_SQUARE_IDS[(((zone - 1) % 3) * 2 + ((zone + 1) % 2)) * 160 + column * 20 + row];
  }
  out.easting = ei - columnIndex * MGRS_SQUARE_METERS;
  out.northing = ni - rowIndex * MGRS_SQUARE_METERS;
  return true;
}

/**
 * Fill `out` for the point `[e, n]` in `crs`. `utmBandLetter` is the UTM latitude band (ignored
 * for UPS, whose band comes from E). Returns false for non-finite input, a missing UTM band, or
 * E/N outside the lettered squares (UTM columns 100–900 km, the UPS polar tables).
 */
export function computeMgrsParts(
  crs: LgrsCrsId,
  e: number,
  n: number,
  utmBandLetter: string,
  out: MgrsParts
): boolean {
  if (!Number.isFinite(e) || !Number.isFinite(n)) return false;
  const ei = Math.floor(e);
  const ni = Math.floor(n);
  if (!computeSquare(crs, ei, ni, out)) return false;
  if (crs === EARTH_CRS_UPS_SOUTH || crs === EARTH_CRS_UPS_NORTH) {
    out.zoneBand = getUpsBandLetter(crs, ei);
  } else {
    if (!utmBandLetter) return false;
    out.zoneBand = ZONE_NAMES[getUtmZone(crs)] + utmBandLetter;
  }
  return true;
}

/** The 100 km square ID (e.g. `TN`, `AH`) containing `[e, n]` in `crs`, or null. */
export function getMgrsSquareId(crs: LgrsCrsId, e: number, n: number): string | null {
  if (!Number.isFinite(e) || !Number.isFinite(n)) return null;
  return computeSquare(crs, Math.floor(e), Math.floor(n), parts) ? parts.square : null;
}

/** UTM band letter of `lat` clamped to [-80, 84), so latitudes past the UTM/UPS seams give C or X. */
function getClampedUtmBandLetter(lat: number): string {
  if (lat < UTM_MIN_LATITUDE) return "C";
  if (lat >= UTM_MAX_LATITUDE) return "X";
  return getEarthLatitudeBandLetter(lat);
}

/**
 * Band letter for a point at latitude `lat` in `crs`: the UTM band of `lat` clamped to C–X, or
 * `""` for UPS (the band comes from E). Any latitude in [-90, 90] is accepted, so a point outside
 * the crs's own region is still labelled in that crs. Null for an invalid crs or latitude.
 */
export function getEarthPointBandLetter(crs: LgrsCrsId, lat: number): string | null {
  if (!(lat >= -90 && lat <= 90)) return null;
  if (crs === EARTH_CRS_UPS_SOUTH || crs === EARTH_CRS_UPS_NORTH) return "";
  return getUtmZone(crs) === 0 ? null : getClampedUtmBandLetter(lat);
}

/**
 * Band letter for a box label: the UTM band at the latitude of `[e, n]` (the box centre)
 * unprojected in `crs`, clamped to C–X, or `""` for UPS.
 */
export function getEarthBoxBandLetter(crs: LgrsCrsId, e: number, n: number): string | null {
  if (crs === EARTH_CRS_UPS_SOUTH || crs === EARTH_CRS_UPS_NORTH) return "";
  if (getUtmZone(crs) === 0 || !unprojectEarthToLatLon(e, n, crs, scratch)) return null;
  return getClampedUtmBandLetter(scratch[0]);
}

/** Digits per axis at an MGRS precision, or −1 for an unsupported precision. */
function mgrsDigitCount(precision: number): number {
  switch (precision) {
    case 1:
      return 5;
    case 10:
      return 4;
    case 100:
      return 3;
    case 1000:
      return 2;
    case 10000:
      return 1;
    case 100000:
      return 0;
    default:
      return -1;
  }
}

function buildMgrs(precision: EarthMgrsPrecision, count: number): string {
  const head = parts.zoneBand + " " + parts.square;
  if (count === 0) return head;
  return (
    head +
    " " +
    fixedDigits(Math.floor(parts.easting / precision), count) +
    " " +
    fixedDigits(Math.floor(parts.northing / precision), count)
  );
}

/**
 * Canonical MGRS for the point `[e, n]` in `crs` with latitude `lat` (formatting from E/N, no
 * projection), e.g. `15R TN 9751 7177` at 10 m, `15R TN` at 100 km, `Z AH 0000 0000` in UPS.
 * The band comes from `getEarthPointBandLetter`. Null for an invalid latitude or E/N outside the
 * lettered squares.
 */
export function formatMgrs(
  crs: LgrsCrsId,
  e: number,
  n: number,
  lat: number,
  precision: EarthMgrsPrecision
): string | null {
  const count = mgrsDigitCount(precision);
  const band = getEarthPointBandLetter(crs, lat);
  if (count < 0 || band === null || !computeMgrsParts(crs, e, n, band, parts)) return null;
  return buildMgrs(precision, count);
}

/**
 * Canonical MGRS for a WGS84 lat/lon in its own UTM zone (with the Norway/Svalbard exceptions)
 * or UPS cap. The only code that produces MGRS strings for points.
 */
export function formatCanonicalMgrs(
  lat: number,
  lon: number,
  precision: EarthMgrsPrecision
): string | null {
  const crs = classifyEarthLatLon(lat, lon);
  if (crs < 0 || !projectEarthLatLon(lat, lon, crs, scratch)) return null;
  return formatMgrs(crs, scratch[0], scratch[1], lat, precision);
}

/**
 * MGRS label of the `precision` box with grid-southwest corner `[lowerLeftE, lowerLeftN]` in
 * `crs` (floored to a multiple of `precision`). Formatted from the corner without projecting it;
 * the band comes from the box centre (`getEarthBoxBandLetter`). `lgrs` and `acc` are both the
 * compact MGRS (`15RTN97517177`), `prefix` is `15RTN`, `condensed` the digits, and `text`
 * `9751 7177` (or `prefix` at 100 km).
 */
export function formatMgrsBoxLabel(
  crs: LgrsCrsId,
  lowerLeftE: number,
  lowerLeftN: number,
  precision: EarthMgrsPrecision
): EarthGridLabel | null {
  const count = mgrsDigitCount(precision);
  if (count < 0 || !Number.isFinite(lowerLeftE) || !Number.isFinite(lowerLeftN)) return null;
  const lowerLeft: LgrsCoordinate = [
    Math.floor(lowerLeftE / precision) * precision,
    Math.floor(lowerLeftN / precision) * precision,
  ];
  const half = precision / 2;
  const band = getEarthBoxBandLetter(crs, lowerLeft[0] + half, lowerLeft[1] + half);
  if (band === null || !computeMgrsParts(crs, lowerLeft[0], lowerLeft[1], band, parts)) {
    return null;
  }
  const prefix = parts.zoneBand + parts.square;
  if (count === 0) {
    return { lgrs: prefix, acc: prefix, prefix, condensed: "", text: prefix, lowerLeft, precision };
  }
  const easting = fixedDigits(Math.floor(parts.easting / precision), count);
  const northing = fixedDigits(Math.floor(parts.northing / precision), count);
  const compact = prefix + easting + northing;
  return {
    lgrs: compact,
    acc: compact,
    prefix,
    condensed: easting + northing,
    text: `${easting} ${northing}`,
    lowerLeft,
    precision,
  };
}
