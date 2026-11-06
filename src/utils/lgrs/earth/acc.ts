import {
  EARTH_ACC_1KM_LETTERS,
  EARTH_ACC_AREA_METERS,
  EARTH_ACC_SUB_AREA_LETTERS,
} from "./constants";
import { fixedDigits } from "./digits";
import { computeMgrsParts, getEarthBoxBandLetter, getEarthPointBandLetter } from "./mgrs";
import { projectEarthLatLon } from "./projection";
import { classifyEarthLatLon } from "./zones";

/**
 * Earth ACC labels: the MGRS zone/band and 100 km square, a 25 km sub-area (`ABCD`, easting
 * first), then the lunar ACC 1 km letters and truncated digits, e.g. `15RTNDC X51 W77`.
 */

const parts: MgrsParts = { zoneBand: "", square: "", easting: 0, northing: 0 };
const scratch = new Float64Array(2);

// Scratch outputs of `computeAccParts` (single-threaded, no allocation).
let accPrefix = "";
let accEasting = 0;
let accNorthing = 0;

/** Digits per axis after the 1 km letter, or −1 for an unsupported precision. */
function residualDigitCount(precision: number): number {
  switch (precision) {
    case 1:
      return 3;
    case 10:
      return 2;
    case 100:
      return 1;
    case 1000:
      return 0;
    case 25000:
      return 0;
    default:
      return -1;
  }
}

/** Prefix and within-25 km metres from `parts`. */
function computeAccParts(): void {
  const eastingArea = Math.floor(parts.easting / EARTH_ACC_AREA_METERS);
  const northingArea = Math.floor(parts.northing / EARTH_ACC_AREA_METERS);
  accPrefix =
    parts.zoneBand +
    parts.square +
    EARTH_ACC_SUB_AREA_LETTERS[eastingArea] +
    EARTH_ACC_SUB_AREA_LETTERS[northingArea];
  accEasting = parts.easting - eastingArea * EARTH_ACC_AREA_METERS;
  accNorthing = parts.northing - northingArea * EARTH_ACC_AREA_METERS;
}

/** One condensed axis, e.g. `X51` for 22,516 m at 10 m. */
function accAxis(within: number, precision: EarthAccPrecision, count: number): string {
  return (
    EARTH_ACC_1KM_LETTERS[Math.floor(within / 1000)] +
    fixedDigits(Math.floor((within % 1000) / precision), count)
  );
}

/**
 * ACC string for the point `[e, n]` in `crs` with latitude `lat` (formatting from E/N, no
 * projection). `"condensed"` gives `X51 W77`, `"full"` gives `15RTNDC X51 W77`; at 25 km both are
 * the prefix alone. Null when `lat` is outside the crs's latitude range or E/N is outside the
 * lettered MGRS squares.
 */
export function formatEarthAcc(
  crs: LgrsCrsId,
  e: number,
  n: number,
  lat: number,
  precision: EarthAccPrecision,
  style: LgrsDisplayStyle
): string | null {
  const count = residualDigitCount(precision);
  const band = getEarthPointBandLetter(crs, lat);
  if (count < 0 || band === null || !computeMgrsParts(crs, e, n, band, parts)) return null;
  computeAccParts();
  if (precision === 25000) return accPrefix;
  const axes = accAxis(accEasting, precision, count) + " " + accAxis(accNorthing, precision, count);
  return style === "full" ? accPrefix + " " + axes : axes;
}

/** ACC string for a WGS84 lat/lon in its own UTM zone or UPS cap (point semantics). */
export function formatEarthAccFromLatLon(
  lat: number,
  lon: number,
  precision: EarthAccPrecision,
  style: LgrsDisplayStyle
): string | null {
  const crs = classifyEarthLatLon(lat, lon);
  if (crs < 0 || !projectEarthLatLon(lat, lon, crs, scratch)) return null;
  return formatEarthAcc(crs, scratch[0], scratch[1], lat, precision, style);
}

/**
 * ACC label of the `precision` box with grid-southwest corner `[lowerLeftE, lowerLeftN]` in
 * `crs` (floored to a multiple of `precision`), with the lunar `formatLgrsLabel` field
 * semantics: `lgrs` is the prefix plus within-25 km digits (`15RTNDC22512177`), `acc` the compact
 * ACC (`15RTNDCX51W77`), and `text` `X51 W77` (or `prefix` at 25 km). Formatted from the corner
 * without projecting it; the band comes from the box centre (`getEarthBoxBandLetter`).
 */
export function formatEarthAccBoxLabel(
  crs: LgrsCrsId,
  lowerLeftE: number,
  lowerLeftN: number,
  precision: EarthAccPrecision
): LgrsLabel | null {
  const count = residualDigitCount(precision);
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
  computeAccParts();
  const prefix = accPrefix;
  if (precision === 25000) {
    return { lgrs: prefix, acc: prefix, prefix, condensed: "", text: prefix, lowerLeft, precision };
  }
  const digitCount = count + 2;
  const lgrs =
    prefix +
    fixedDigits(Math.floor(accEasting / precision), digitCount) +
    fixedDigits(Math.floor(accNorthing / precision), digitCount);
  const easting = accAxis(accEasting, precision, count);
  const northing = accAxis(accNorthing, precision, count);
  return {
    lgrs,
    acc: prefix + easting + northing,
    prefix,
    condensed: easting + northing,
    text: `${easting} ${northing}`,
    lowerLeft,
    precision,
  };
}
