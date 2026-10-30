import {
  SURF_NAV_LGRS_ACC,
  SURF_NAV_LPS_E25K,
  SURF_NAV_LPS_FALSE_EAST,
  SURF_NAV_LPS_FALSE_NORTH,
  SURF_NAV_LPS_N25K,
  SURF_NAV_MOON_K0,
  SURF_NAV_MOON_MEAN_RADIUS,
} from "utils/consts";
import {
  formatSouthLpsCoordinate,
  isSupportedSouthLpsCoordinate,
  type LgrsPrecision,
  type LpsCoordinate,
  type SouthLpsLabel,
} from "./dynamicGrid";

/**
 * Port of pinned Python lgrs LatLonPoint(...).to_lps() for canonical south LPS.
 * Accuracy is verified by the lgrs 0.3.0 reference corpus: more than 3,000 Python-generated
 * geographic-to-LPS and display-label cases, plus Python-generated viewport-grid render plans.
 */
const SOUTH_LPS_LATITUDE = -90;
const SOUTH_LPS_LONGITUDE = 0;
export const LGRS_DISPLAY_PRECISION_METERS: LgrsPrecision = 10;
const LPS_NUMERIC_TOLERANCE_METERS = 1e-9;

interface LpsPair {
  e_lps: number;
  n_lps: number;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function normalizeLpsCoordinate(value: number): number {
  const nearestInteger = Math.round(value);
  return Math.abs(value - nearestInteger) <= LPS_NUMERIC_TOLERANCE_METERS ? nearestInteger : value;
}

export function latLonToSouthLps(point: AEGISPoint): LpsCoordinate | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;

  const latitude = radians(point.lat);
  const longitude = radians(point.lng);
  const originLatitude = radians(SOUTH_LPS_LATITUDE);
  const originLongitude = radians(SOUTH_LPS_LONGITUDE);
  const scale =
    (2 * SURF_NAV_MOON_K0) /
    (1 +
      Math.sin(originLatitude) * Math.sin(latitude) +
      Math.cos(originLatitude) * Math.cos(latitude) * Math.cos(longitude - originLongitude));

  const easting =
    SURF_NAV_MOON_MEAN_RADIUS * scale * Math.cos(latitude) * Math.sin(longitude) +
    SURF_NAV_LPS_FALSE_EAST;
  const northing =
    SURF_NAV_MOON_MEAN_RADIUS *
      scale *
      (Math.cos(originLatitude) * Math.sin(latitude) -
        Math.sin(originLatitude) * Math.cos(latitude) * Math.cos(longitude - originLongitude)) +
    SURF_NAV_LPS_FALSE_NORTH;

  return [normalizeLpsCoordinate(easting), normalizeLpsCoordinate(northing)];
}

/* LGRS owns AEGIS coordinate display: this is the browser port of pinned
 * lgrs LatLonPoint(...).to_lps() for canonical south LPS. Surf-nav remains
 * responsible only for the established LPS grid-north bearing convention.
 */
export function latlong_to_lps(lat: number, lng: number): LpsPair | null {
  const coordinate = latLonToSouthLps({ lat, lng });
  if (!coordinate) return null;

  const [e_lps, n_lps] = coordinate;
  return { e_lps, n_lps };
}

export function formatSouthLpsFromLatLng(
  point: AEGISPoint,
  precision: LgrsPrecision
): SouthLpsLabel | null {
  const coordinate = latLonToSouthLps(point);
  return coordinate ? formatSouthLpsCoordinate(coordinate, precision) : null;
}

export function getSouthLpsDisplayCoordinate(
  point: AEGISPoint,
  format: "condensed" | "full" = "condensed"
): string | null {
  const label = formatSouthLpsFromLatLng(point, LGRS_DISPLAY_PRECISION_METERS);
  if (format === "condensed") return label?.text ?? null;
  if (!label) return null;

  const gridZone = label.acc.slice(0, 3);
  const coordinateDigits = label.acc.slice(3);
  const eastingLength = coordinateDigits.length / 2;
  return `${gridZone} ${coordinateDigits.slice(0, eastingLength)} ${coordinateDigits.slice(
    eastingLength
  )}`;
}

/** Inverse of `latLonToSouthLps`: canonical south LPS easting/northing to lat/lng. */
export function southLpsToLatLon([easting, northing]: LpsCoordinate): AEGISPoint | null {
  if (!isSupportedSouthLpsCoordinate([easting, northing])) return null;
  const x = easting - SURF_NAV_LPS_FALSE_EAST;
  const y = northing - SURF_NAV_LPS_FALSE_NORTH;
  const rho = Math.hypot(x, y);
  const latitude =
    2 * Math.atan(rho / (2 * SURF_NAV_MOON_MEAN_RADIUS * SURF_NAV_MOON_K0)) - Math.PI / 2;
  const longitude = rho === 0 ? 0 : Math.atan2(x, y);
  return { lat: (latitude * 180) / Math.PI, lng: (longitude * 180) / Math.PI };
}

const LGRS_LETTER = "[A-HJ-NP-Z-]";
const FULL_LGRS_PATTERN = new RegExp(
  `^([AB])([A-HJ-NP-Z])([A-HJ-NP-Z+-])(${LGRS_LETTER})(\\d{0,3})(${LGRS_LETTER})(\\d{0,3})$`
);
const CONDENSED_LGRS_PATTERN = new RegExp(`^(${LGRS_LETTER})(\\d{0,3})(${LGRS_LETTER})(\\d{0,3})$`);
const LGRS_AREA_METERS = 25000;

/** Offset of a cell centre within its 25 km area, from a 1 km letter and residual digits. */
function withinAreaCenter(letter: string, digits: string): number | null {
  const kilometre = SURF_NAV_LGRS_ACC.indexOf(letter);
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
    const eastingIndex = SURF_NAV_LPS_E25K.indexOf(eastingLetterArea);
    const northingIndex = SURF_NAV_LPS_N25K.indexOf(northingLetterArea);
    if (eastingIndex < 0 || northingIndex < 0) return null;
    eastingArea = band === "A" ? eastingIndex - 24 : eastingIndex;
    northingArea = northingIndex - 13;
  } else {
    const referenceLps = reference ? latLonToSouthLps(reference) : null;
    if (!referenceLps) return null;
    const referenceEasting = referenceLps[0] - SURF_NAV_LPS_FALSE_EAST;
    const referenceNorthing = referenceLps[1] - SURF_NAV_LPS_FALSE_NORTH;
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
    eastingArea * LGRS_AREA_METERS + withinEasting + SURF_NAV_LPS_FALSE_EAST,
    northingArea * LGRS_AREA_METERS + withinNorthing + SURF_NAV_LPS_FALSE_NORTH,
  ]);
}
