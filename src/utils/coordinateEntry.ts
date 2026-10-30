import { getSouthLpsDisplayCoordinate, parseSouthLpsLabel } from "utils/lgrs/southLps";
import { findGlobalGridCoordsFromPoint, findGridCellCenterByName } from "utils/mapping/geoMath";

const LAT_LNG_PATTERN = /^\s*([+-]?\d+(?:\.\d+)?)\s*[,\s]\s*([+-]?\d+(?:\.\d+)?)\s*$/;

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
    const label = getSouthLpsDisplayCoordinate(
      location,
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
    return context.dynamicLgrs ? "LGRS (BKL K12 L34) or lat, lng" : "LGRS (K12 L34) or lat, lng";
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
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return { location: null, error: "Latitude must be between -90 and 90" };
    }
    if (!Number.isFinite(lng) || lng < -360 || lng > 360) {
      return { location: null, error: "Longitude must be between -360 and 360" };
    }
    return { location: { lat, lng }, error: null };
  }

  if (context.usingLGRSCoordinates) {
    const location = parseSouthLpsLabel(trimmed, context.landerLocation);
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
