import {
  LGRS_MOON_RADIUS,
  LPS_FALSE_EASTING,
  LPS_FALSE_NORTHING,
  LPS_INTEGER_TOLERANCE_METERS,
  LPS_K0,
  LTM_FALSE_EASTING,
  LTM_FALSE_NORTHING_NORTH,
  LTM_FALSE_NORTHING_SOUTH,
  LTM_K0,
} from "./constants";
import {
  conformLongitude,
  getLtmCentralMeridian,
  getLtmZone,
  isSouthCrs,
  LGRS_CRS_LPS_NORTH,
  LGRS_CRS_LPS_SOUTH,
} from "./crs";

/**
 * Closed-form LPS and LTM on the IAU 2015 sphere. LPS uses the general spherical stereographic
 * form of the original south-LPS port (bit-identical to it in the south). LTM ports PROJ's
 * spherical Transverse Mercator (Evenden/Snyder), which the `lgrs` reference uses through pyproj.
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 1 / DEG_TO_RAD;
const HALF_PI = Math.PI / 2;
const EPS10 = 1e-10;
const INVERSE_RADIUS = 1 / LGRS_MOON_RADIUS;
const LTM_ML0 = 0.5 * LTM_K0;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

const SOUTH_SIN_ORIGIN = Math.sin(radians(-90));
const SOUTH_COS_ORIGIN = Math.cos(radians(-90));
const NORTH_SIN_ORIGIN = Math.sin(radians(90));
const NORTH_COS_ORIGIN = Math.cos(radians(90));

function normalizeLps(value: number): number {
  const nearestInteger = Math.round(value);
  return Math.abs(value - nearestInteger) <= LPS_INTEGER_TOLERANCE_METERS ? nearestInteger : value;
}

/** PROJ `adjlon`: wrap radians into [-π, π]. */
function adjustLongitude(lon: number): number {
  if (Math.abs(lon) < Math.PI + 1e-12) return lon;
  lon += Math.PI;
  lon -= 2 * Math.PI * Math.floor(lon / (2 * Math.PI));
  return lon - Math.PI;
}

function projectLps(lat: number, lon: number, south: boolean, out: Float64Array): boolean {
  const latitude = radians(lat);
  const longitude = radians(lon);
  const sinOrigin = south ? SOUTH_SIN_ORIGIN : NORTH_SIN_ORIGIN;
  const cosOrigin = south ? SOUTH_COS_ORIGIN : NORTH_COS_ORIGIN;
  const scale =
    (2 * LPS_K0) /
    (1 + sinOrigin * Math.sin(latitude) + cosOrigin * Math.cos(latitude) * Math.cos(longitude));
  const easting =
    LGRS_MOON_RADIUS * scale * Math.cos(latitude) * Math.sin(longitude) + LPS_FALSE_EASTING;
  const northing =
    LGRS_MOON_RADIUS *
      scale *
      (cosOrigin * Math.sin(latitude) - sinOrigin * Math.cos(latitude) * Math.cos(longitude)) +
    LPS_FALSE_NORTHING;
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return false;
  out[0] = normalizeLps(easting);
  out[1] = normalizeLps(northing);
  return true;
}

function projectLtm(lat: number, lon: number, crs: LgrsCrsId, out: Float64Array): boolean {
  const phi = lat * DEG_TO_RAD;
  const lam = adjustLongitude(
    lon * DEG_TO_RAD - getLtmCentralMeridian(getLtmZone(crs)) * DEG_TO_RAD
  );
  const cosPhi = Math.cos(phi);
  let b = cosPhi * Math.sin(lam);
  if (Math.abs(Math.abs(b) - 1) <= EPS10) return false;

  const x = LTM_ML0 * Math.log((1 + b) / (1 - b));
  let y = (cosPhi * Math.cos(lam)) / Math.sqrt(1 - b * b);
  b = Math.abs(y);
  if (cosPhi === 1 && (lam < -HALF_PI || lam > HALF_PI)) {
    y = Math.PI;
  } else if (cosPhi === 1) {
    // Within ~1e-8 rad of the equator acos(y) is only float noise; PROJ's result here is 0.
    y = 0;
  } else if (b >= 1) {
    if (b - 1 > EPS10) return false;
    y = 0;
  } else {
    y = Math.acos(y);
  }
  if (phi < 0) y = -y;
  y = LTM_K0 * y;

  const falseNorthing = isSouthCrs(crs) ? LTM_FALSE_NORTHING_SOUTH : LTM_FALSE_NORTHING_NORTH;
  out[0] = LGRS_MOON_RADIUS * x + LTM_FALSE_EASTING;
  out[1] = LGRS_MOON_RADIUS * y + falseNorthing;
  return Number.isFinite(out[0]) && Number.isFinite(out[1]);
}

/**
 * Project lat/lon (degrees) into `crs`, writing `[E, N]`. Any valid crs may be used, so a point
 * can be projected into a neighbouring zone. Returns false for invalid input or a non-finite
 * result. Does not check that the point lies in the crs's own region.
 */
export function projectLatLon(
  lat: number,
  lon: number,
  crs: LgrsCrsId,
  out: Float64Array
): boolean {
  if (!(lat >= -90 && lat <= 90) || !Number.isFinite(lon)) return false;
  if (crs === LGRS_CRS_LPS_SOUTH) return projectLps(lat, lon, true, out);
  if (crs === LGRS_CRS_LPS_NORTH) return projectLps(lat, lon, false, out);
  if (getLtmZone(crs) === 0) return false;
  return projectLtm(lat, lon, crs, out);
}

function unprojectLps(e: number, n: number, south: boolean, out: Float64Array): boolean {
  const x = (e - LPS_FALSE_EASTING) / LGRS_MOON_RADIUS;
  const y = (n - LPS_FALSE_NORTHING) / LGRS_MOON_RADIUS;
  const rho = Math.sqrt(x * x + y * y);
  const colatitude = 2 * Math.atan(rho / (2 * LPS_K0));
  out[0] = (south ? colatitude - HALF_PI : HALF_PI - colatitude) * RAD_TO_DEG;
  out[1] = rho === 0 ? 0 : conformLongitude(Math.atan2(x, south ? y : -y) * RAD_TO_DEG);
  return Number.isFinite(out[0]) && Number.isFinite(out[1]);
}

function unprojectLtm(e: number, n: number, crs: LgrsCrsId, out: Float64Array): boolean {
  const falseNorthing = isSouthCrs(crs) ? LTM_FALSE_NORTHING_SOUTH : LTM_FALSE_NORTHING_NORTH;
  const x = (e - LTM_FALSE_EASTING) * INVERSE_RADIUS;
  const y = (n - falseNorthing) * INVERSE_RADIUS;
  let h = Math.exp(x / LTM_K0);
  if (!Number.isFinite(h)) return false;
  const g = 0.5 * (h - 1 / h);
  const d = y / LTM_K0;
  h = Math.cos(d);
  let phi = Math.asin(Math.sqrt((1 - h * h) / (1 + g * g)));
  if (d < 0) phi = -phi;
  const lam = g !== 0 || h !== 0 ? Math.atan2(g, h) : 0;
  const centralMeridian = getLtmCentralMeridian(getLtmZone(crs)) * DEG_TO_RAD;
  out[0] = phi * RAD_TO_DEG;
  out[1] = conformLongitude(adjustLongitude(lam + centralMeridian) * RAD_TO_DEG);
  return Number.isFinite(out[0]) && Number.isFinite(out[1]);
}

/** Inverse of `projectLatLon`, writing `[lat, lon]` with lon conformed to [-180, 180). */
export function unprojectToLatLon(
  e: number,
  n: number,
  crs: LgrsCrsId,
  out: Float64Array
): boolean {
  if (!Number.isFinite(e) || !Number.isFinite(n)) return false;
  if (crs === LGRS_CRS_LPS_SOUTH) return unprojectLps(e, n, true, out);
  if (crs === LGRS_CRS_LPS_NORTH) return unprojectLps(e, n, false, out);
  if (getLtmZone(crs) === 0) return false;
  return unprojectLtm(e, n, crs, out);
}
