import {
  SURF_NAV_LPS_FALSE_EAST,
  SURF_NAV_LPS_FALSE_NORTH,
  SURF_NAV_MOON_K0,
  SURF_NAV_MOON_MEAN_RADIUS,
} from "utils/consts";
import {
  formatSouthLpsCoordinate,
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

export function getSouthLpsDisplayCoordinate(point: AEGISPoint): string | null {
  return formatSouthLpsFromLatLng(point, LGRS_DISPLAY_PRECISION_METERS)?.text ?? null;
}
