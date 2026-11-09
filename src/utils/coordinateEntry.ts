import {
  findGridCellCenterByName,
  findGlobalGridCoordsFromPoint,
  gridHasCellNamePrefix,
} from "utils/mapping/geoMath";
import { formatLgrsFromLatLon, LGRS_DISPLAY_PRECISION_METERS } from "utils/lgrs/display";
import { isPartialLgrsLabel, parseLgrsLabel } from "utils/lgrs/parse";

const LAT_LNG_PATTERN = /^\s*([+-]?\d+(?:\.\d+)?)\s*[,\s]\s*([+-]?\d+(?:\.\d+)?)\s*$/;
/** A "lat, lng" pair so far — only digits, sign, decimal point, and at most one separator. */
const LAT_LNG_PARTIAL_PATTERN = /^\s*[+-]?\d*\.?\d*(?:\s*[,\s]\s*[+-]?\d*\.?\d*)?\s*$/;

/** "lat, lng" with six decimals. */
export function formatLatLng(location: AEGISPoint): string {
  return `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
}

/** A location in the mission's configured presentation: its grid when it has one, else lat/lng. */
export function formatCoordinateEntry(
  location: AEGISPoint | null,
  context: CoordinateEntryContext
): string {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return "";
  if (context.usingLGRSCoordinates) {
    const label = formatLgrsFromLatLon(
      location,
      LGRS_DISPLAY_PRECISION_METERS,
      context.dynamicLgrs ? "full" : "condensed"
    );
    if (label) return label;
  } else if (context.serverGrid) {
    const name = findGlobalGridCoordsFromPoint(context.serverGrid, location, context.planetRadius);
    if (name && name !== "N/A") return name;
  }
  return formatLatLng(location);
}

/** The accepted coordinate syntax, shown as the field placeholder. */
export function getCoordinateEntryHint(context: CoordinateEntryContext): string {
  if (context.usingLGRSCoordinates) {
    return context.dynamicLgrs ? "LGRS (23NFF -00 -00) or lat, lng" : "LGRS (K12 L34) or lat, lng";
  }
  if (context.serverGrid) return "Grid cell name or lat, lng";
  return "lat, lng (e.g. -89.5, 45.2)";
}

/**
 * Parse typed coordinates: "lat, lng" always, plus the mission's grid form (LGRS labels, or a
 * server-file grid cell name, which resolves to the cell centre). Full precision is kept.
 */
export function parseCoordinateEntry(
  text: string,
  context: CoordinateEntryContext
): CoordinateEntryResult {
  const trimmed = text.trim();
  if (!trimmed) return { location: null, error: "Enter coordinates" };

  const latLng = LAT_LNG_PATTERN.exec(trimmed);
  if (latLng) {
    const lat = Number(latLng[1]);
    const lng = Number(latLng[2]);
    const rangeError = latLngRangeError(lat, lng);
    if (rangeError) return { location: null, error: rangeError };
    return { location: { lat, lng }, error: null };
  }

  if (context.usingLGRSCoordinates) {
    const location = parseLgrsLabel(trimmed, context.landerLocation);
    if (location) return { location, error: null };
    return { location: null, error: `Not a valid LGRS label or lat, lng: "${trimmed}"` };
  }
  if (context.serverGrid) {
    const location = findGridCellCenterByName(context.serverGrid, trimmed, context.planetRadius);
    if (location) return { location, error: null };
    return { location: null, error: `Not a grid cell in this mission or lat, lng: "${trimmed}"` };
  }
  return { location: null, error: "Enter coordinates as lat, lng" };
}

/** Range violations of a parsed "lat, lng" pair, shared by the submit and live typing checks. */
function latLngRangeError(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return "Latitude must be between -90 and 90";
  }
  if (!Number.isFinite(lng) || lng < -360 || lng > 360) {
    return "Longitude must be between -360 and 360";
  }
  return null;
}

/**
 * Live validation for keystroke editing: an error only once the text can no longer become a
 * valid entry — a complete out-of-range "lat, lng" pair, or text that no accepted form (or a
 * prefix of one) could still match. Half-typed numbers or grid labels stay quiet;
 * `parseCoordinateEntry` remains the authoritative check when the entry is submitted.
 */
export function getLiveCoordinateEntryError(
  text: string,
  context: CoordinateEntryContext
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const latLng = LAT_LNG_PATTERN.exec(trimmed);
  if (latLng) return latLngRangeError(Number(latLng[1]), Number(latLng[2]));
  if (LAT_LNG_PARTIAL_PATTERN.test(trimmed)) return null;

  if (context.usingLGRSCoordinates) {
    if (parseLgrsLabel(trimmed, context.landerLocation)) return null;
    if (isPartialLgrsLabel(trimmed)) return null;
    return `Not a valid LGRS label or lat, lng: "${trimmed}"`;
  }
  if (context.serverGrid) {
    if (findGridCellCenterByName(context.serverGrid, trimmed, context.planetRadius)) return null;
    if (gridHasCellNamePrefix(context.serverGrid, trimmed)) return null;
    return `Not a grid cell in this mission or lat, lng: "${trimmed}"`;
  }
  return "Enter coordinates as lat, lng";
}
