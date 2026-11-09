import {
  ACC_1KM_LETTERS,
  LPS_EASTING_AREA_LETTERS,
  LPS_FALSE_EASTING,
  LPS_FALSE_NORTHING,
  LPS_NORTHING_AREA_LETTERS,
} from "./constants";
import { classifyLatLon, LGRS_CRS_LPS_SOUTH } from "./crs";
import { formatLgrsFromLatLon, LGRS_DISPLAY_PRECISION_METERS } from "./display";
import { formatLgrsLabel } from "./format";
import { projectLatLon, unprojectToLatLon } from "./projection";

/** Canonical south LPS coordinates for asset coordinate entry. */
export function latLonToSouthLps(point: AEGISPoint): LgrsCoordinate | null {
  if (!point) return null;
  const projected = new Float64Array(2);
  return projectLatLon(point.lat, point.lng, LGRS_CRS_LPS_SOUTH, projected)
    ? [projected[0], projected[1]]
    : null;
}

export function getSouthLpsDisplayCoordinate(
  point: AEGISPoint,
  style: LgrsDisplayStyle = "condensed"
): string | null {
  if (!point || classifyLatLon(point.lat, point.lng) !== LGRS_CRS_LPS_SOUTH) return null;
  return formatLgrsFromLatLon(point, LGRS_DISPLAY_PRECISION_METERS, style);
}

/** Inverse south LPS coordinates within the supported polar domain. */
export function southLpsToLatLon([easting, northing]: LgrsCoordinate): AEGISPoint | null {
  if (!formatLgrsLabel(easting, northing, LGRS_CRS_LPS_SOUTH, 1)) return null;
  const point = new Float64Array(2);
  return unprojectToLatLon(easting, northing, LGRS_CRS_LPS_SOUTH, point)
    ? { lat: point[0], lng: point[1] }
    : null;
}

const LGRS_LETTER = "[A-HJ-NP-Z-]";
const FULL_LGRS_PATTERN = new RegExp(
  `^([AB])([A-HJ-NP-Z])([A-HJ-NP-Z+-])(${LGRS_LETTER})(\\d{0,3})(${LGRS_LETTER})(\\d{0,3})$`
);
const CONDENSED_LGRS_PATTERN = new RegExp(`^(${LGRS_LETTER})(\\d{0,3})(${LGRS_LETTER})(\\d{0,3})$`);
// Same grammar with every group after the first two optional (nested, so a middle group
// cannot be skipped while a later one is present), for prefix-matching half-typed labels.
const FULL_LGRS_PREFIX_PATTERN = new RegExp(
  `^([AB])([A-HJ-NP-Z])(?:([A-HJ-NP-Z+-])(?:(${LGRS_LETTER})(\\d{0,3})(?:(${LGRS_LETTER})(\\d{0,3})?)?)?)?$`
);
const CONDENSED_LGRS_PREFIX_PATTERN = new RegExp(
  `^(${LGRS_LETTER})(\\d{0,3})(?:(${LGRS_LETTER})(\\d{0,3})?)?$`
);
const LGRS_AREA_METERS = 25000;

/**
 * Whether the text could still become a valid LGRS label if more characters were typed —
 * e.g. "K12 L" is half of "K12 L34". Lets live typing validation stay quiet on incomplete
 * input; `parseSouthLpsLabel` is the authoritative check for complete entries.
 */
export function isPartialSouthLpsLabel(text: string): boolean {
  const compact = text.replace(/\s+/g, "").toUpperCase();
  if (!compact) return true;
  return FULL_LGRS_PREFIX_PATTERN.test(compact) || CONDENSED_LGRS_PREFIX_PATTERN.test(compact);
}

/** Offset of a cell centre within its 25 km area, from a 1 km letter and residual digits. */
function withinAreaCenter(letter: string, digits: string): number | null {
  const kilometre = ACC_1KM_LETTERS.indexOf(letter);
  if (kilometre < 0) return null;
  const precision = 10 ** (3 - digits.length);
  return kilometre * 1000 + (digits ? parseInt(digits, 10) : 0) * precision + precision / 2;
}

/**
 * Parse an LGRS label as shown by `getSouthLpsDisplayCoordinate` into the lat/lng of the
 * centre of the cell it names. Accepts the full form with its 25 km area prefix (e.g.
 * "BKL K12 L34") and the condensed form without it (e.g. "K12 L34"), whose area is the one
 * nearest `reference`. Spacing and case are ignored; easting and northing must have the same
 * number of digits (0–3, i.e. 1 km to 1 m precision).
 * @returns null when the text is not a valid label inside the south LPS domain.
 */
export function parseSouthLpsLabel(text: string, reference?: AEGISPoint | null): AEGISPoint | null {
  const compact = text.replace(/\s+/g, "").toUpperCase();
  const full = FULL_LGRS_PATTERN.exec(compact);
  const condensed = full ? null : CONDENSED_LGRS_PATTERN.exec(compact);
  const parts = full ? full.slice(4) : condensed?.slice(1);
  if (!parts) return null;
  const [eastingLetter, eastingDigits, northingLetter, northingDigits] = parts;
  if (eastingDigits.length !== northingDigits.length) return null;
  const withinEasting = withinAreaCenter(eastingLetter, eastingDigits);
  const withinNorthing = withinAreaCenter(northingLetter, northingDigits);
  if (withinEasting === null || withinNorthing === null) return null;
  if (withinEasting >= LGRS_AREA_METERS || withinNorthing >= LGRS_AREA_METERS) return null;

  // Offsets from the pole are (area index * 25 km + within-area offset) on both halves.
  let eastingArea: number;
  let northingArea: number;
  if (full) {
    const [band, eastingLetterArea, northingLetterArea] = full.slice(1, 4);
    const eastingIndex = LPS_EASTING_AREA_LETTERS.indexOf(eastingLetterArea);
    const northingIndex = LPS_NORTHING_AREA_LETTERS.indexOf(northingLetterArea);
    if (eastingIndex < 0 || northingIndex < 0) return null;
    eastingArea = band === "A" ? eastingIndex - 24 : eastingIndex;
    northingArea = northingIndex - 13;
  } else {
    const referenceLps = reference ? latLonToSouthLps(reference) : null;
    if (!referenceLps) return null;
    const referenceEasting = referenceLps[0] - LPS_FALSE_EASTING;
    const referenceNorthing = referenceLps[1] - LPS_FALSE_NORTHING;
    const nearestArea = (referenceOffset: number, within: number) => {
      const area = Math.floor(referenceOffset / LGRS_AREA_METERS);
      return [area - 1, area, area + 1].reduce((best, candidate) =>
        Math.abs(candidate * LGRS_AREA_METERS + within - referenceOffset) <
        Math.abs(best * LGRS_AREA_METERS + within - referenceOffset)
          ? candidate
          : best
      );
    };
    eastingArea = nearestArea(referenceEasting, withinEasting);
    northingArea = nearestArea(referenceNorthing, withinNorthing);
  }

  return southLpsToLatLon([
    eastingArea * LGRS_AREA_METERS + withinEasting + LPS_FALSE_EASTING,
    northingArea * LGRS_AREA_METERS + withinNorthing + LPS_FALSE_NORTHING,
  ]);
}
