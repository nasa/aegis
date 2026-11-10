import {
  ACC_1KM_LETTERS,
  LGRS_AREA_METERS,
  LPS_EASTING_AREA_LETTERS,
  LPS_FALSE_EASTING,
  LPS_FALSE_NORTHING,
  LPS_NORTHING_AREA_LETTERS,
  LTM_EASTING_AREA_LETTERS,
  LTM_LATITUDE_BAND_LETTERS,
  LTM_NORTHING_AREA_LETTER_SETS,
  LTM_ZONE_WIDTH_DEGREES,
} from "./constants";
import {
  classifyLatLon,
  conformLongitude,
  getCrsLatitudeLimits,
  getLpsCrsId,
  getLtmCrsId,
  getLtmZone,
  getLtmZoneWestLongitude,
  isLpsCrs,
} from "./crs";
import { formatLatLonAsLgrs } from "./format";
import { projectLatLon, unprojectToLatLon } from "./projection";

const AXIS = "([A-HJ-NP-Z-])(\\d{0,3})";
const AXES = `${AXIS}${AXIS}`;
const POLAR_PREFIX = "[ABYZ][A-HJ-NP-Z][A-HJ-NP-Z+-]";
const ZONE = "(?:[1-9]|[1-3][0-9]|4[0-5])";
const LTM_PREFIX = `${ZONE}[C-HJ-NP-X][ABCDEFGHJK][A-HJ-NP-V]`;
const FULL_PATTERN = new RegExp(`^(${POLAR_PREFIX}|${LTM_PREFIX})(?:${AXES})?$`);
const CONDENSED_PATTERN = new RegExp(`^${AXES}$`);
const AXES_PREFIX = "[A-HJ-NP-Z-]\\d{0,3}(?:[A-HJ-NP-Z-]\\d{0,3})?";
const PARTIAL_PATTERN = new RegExp(
  `^(?:${AXES_PREFIX}|[ABYZ](?:[A-HJ-NP-Z](?:[A-HJ-NP-Z+-](?:${AXES_PREFIX})?)?)?|` +
    `${ZONE}(?:[C-HJ-NP-X](?:[ABCDEFGHJK](?:[A-HJ-NP-V](?:${AXES_PREFIX})?)?)?)?)$`
);

/** A prefix of a full LPS/LTM or condensed ACC display label. */
export function isPartialLgrsLabel(text: string): boolean {
  const compact = text.replace(/\s+/g, "").toUpperCase();
  return !compact || PARTIAL_PATTERN.test(compact);
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Prefer the cell centre. A cell crossing a zone, latitude band or polar boundary needs a
 * point in its clipped part instead; alternate between the cell and region bounds, checking
 * against the shared whole-Moon formatter before accepting a point.
 */
function locationInCell(
  easting: number,
  northing: number,
  crs: LgrsCrsId,
  precision: LgrsPrecision,
  label: string,
  band?: string
): AEGISPoint | null {
  const projected = new Float64Array([easting + precision / 2, northing + precision / 2]);
  const point = new Float64Array(2);
  let [minLat, maxLat] = getCrsLatitudeLimits(crs);
  if (band) {
    minLat = Math.max(minLat, (LTM_LATITUDE_BAND_LETTERS.indexOf(band) - 11) * 8);
    maxLat = Math.min(maxLat, (LTM_LATITUDE_BAND_LETTERS.lastIndexOf(band) - 10) * 8);
  }
  const west = getLtmZoneWestLongitude(getLtmZone(crs));
  const inset = 1e-6;
  const matchingLocation = (e: number, n: number): AEGISPoint | null => {
    if (!unprojectToLatLon(e, n, crs, point)) return null;
    const location = { lat: point[0], lng: point[1] };
    const formatted = formatLatLonAsLgrs(location.lat, location.lng, precision, "acc");
    return classifyLatLon(location.lat, location.lng) === crs && formatted?.endsWith(label)
      ? location
      : null;
  };
  const centre = matchingLocation(projected[0], projected[1]);
  if (centre) return centre;
  // At a band/zone intersection only a corner of the cell may belong to this label.
  for (const e of [easting + inset, easting + precision - inset]) {
    for (const n of [northing + inset, northing + precision - inset]) {
      const corner = matchingLocation(e, n);
      if (corner) return corner;
    }
  }
  for (let attempt = 0; attempt < 64; attempt++) {
    const location = matchingLocation(projected[0], projected[1]);
    if (location) return location;
    const lat = clamp(point[0], minLat + 1e-9, maxLat - 1e-9);
    const lng = isLpsCrs(crs)
      ? point[1]
      : west + clamp(conformLongitude(point[1] - west), 1e-9, LTM_ZONE_WIDTH_DEGREES - 1e-9);
    if (!projectLatLon(lat, lng, crs, projected)) return null;
    projected[0] = clamp(projected[0], easting + inset, easting + precision - inset);
    projected[1] = clamp(projected[1], northing + inset, northing + precision - inset);
  }
  return null;
}

/**
 * Parse full whole-Moon ACC labels (LPS A/B/Y/Z or LTM zone/band) and condensed display
 * labels, at 1 km through 1 m precision. Prefix-only labels identify 25 km cells. Condensed
 * labels use the reference's CRS and the nearest matching cell among its neighbouring areas.
 */
export function parseLgrsLabel(text: string, reference?: AEGISPoint | null): AEGISPoint | null {
  const compact = text.replace(/\s+/g, "").toUpperCase();
  const full = FULL_PATTERN.exec(compact);
  const condensed = full ? null : CONDENSED_PATTERN.exec(compact);
  if (!full && !condensed) return null;
  const prefix = full?.[1];
  const [eastingLetter, eastingDigits, northingLetter, northingDigits] = full
    ? full.slice(2)
    : condensed.slice(1);
  if (eastingDigits?.length !== northingDigits?.length) return null;
  const precision = (eastingLetter ? 10 ** (3 - eastingDigits.length) : 25000) as LgrsPrecision;
  const withinEasting = eastingLetter
    ? ACC_1KM_LETTERS.indexOf(eastingLetter) * 1000 + Number(eastingDigits) * precision
    : 0;
  const withinNorthing = northingLetter
    ? ACC_1KM_LETTERS.indexOf(northingLetter) * 1000 + Number(northingDigits) * precision
    : 0;

  if (!prefix) {
    if (!reference) return null;
    const crs = classifyLatLon(reference.lat, reference.lng);
    const projected = new Float64Array(2);
    if (!projectLatLon(reference.lat, reference.lng, crs, projected)) return null;
    const eastingArea = Math.floor(projected[0] / LGRS_AREA_METERS);
    const northingArea = Math.floor(projected[1] / LGRS_AREA_METERS);
    let nearest: AEGISPoint | null = null;
    let nearestDistance = Infinity;
    const candidate = new Float64Array(2);
    for (let e = eastingArea - 1; e <= eastingArea + 1; e++) {
      for (let n = northingArea - 1; n <= northingArea + 1; n++) {
        const location = locationInCell(
          e * LGRS_AREA_METERS + withinEasting,
          n * LGRS_AREA_METERS + withinNorthing,
          crs,
          precision,
          compact
        );
        if (!location || !projectLatLon(location.lat, location.lng, crs, candidate)) continue;
        const distance = (candidate[0] - projected[0]) ** 2 + (candidate[1] - projected[1]) ** 2;
        if (distance < nearestDistance) {
          nearest = location;
          nearestDistance = distance;
        }
      }
    }
    return nearest;
  }

  if (/^[ABYZ]/.test(prefix)) {
    const [band, eastingArea, northingArea] = prefix;
    const westHalf = band === "A" || band === "Y";
    const crs = getLpsCrsId(band === "A" || band === "B" ? "S" : "N");
    return locationInCell(
      LPS_FALSE_EASTING +
        (LPS_EASTING_AREA_LETTERS.indexOf(eastingArea) - (westHalf ? 24 : 0)) * LGRS_AREA_METERS +
        withinEasting,
      LPS_FALSE_NORTHING +
        (LPS_NORTHING_AREA_LETTERS.indexOf(northingArea) - 13) * LGRS_AREA_METERS +
        withinNorthing,
      crs,
      precision,
      compact
    );
  }

  const zone = Number(prefix.slice(0, -3));
  const [band, eastingArea, northingArea] = prefix.slice(-3);
  const crs = getLtmCrsId(zone, LTM_LATITUDE_BAND_LETTERS.indexOf(band) >= 11 ? "N" : "S");
  const easting =
    (LTM_EASTING_AREA_LETTERS.indexOf(eastingArea) + 5) * LGRS_AREA_METERS + withinEasting;
  const northingIndex = LTM_NORTHING_AREA_LETTER_SETS[(zone - 1) % 3].indexOf(northingArea);
  // LTM northing letters repeat every 500 km; the latitude band selects the cycle.
  for (let area = northingIndex; area < 100; area += 20) {
    const location = locationInCell(
      easting,
      area * LGRS_AREA_METERS + withinNorthing,
      crs,
      precision,
      compact,
      band
    );
    if (location) return location;
  }
  return null;
}
