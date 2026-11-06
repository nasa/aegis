import proj4 from "proj4";

import { UPS_FALSE_EASTING, UPS_FALSE_NORTHING, UPS_K0 } from "./constants";
import {
  conformEarthLongitude,
  EARTH_CRS_UPS_NORTH,
  EARTH_CRS_UPS_SOUTH,
  getUtmZone,
  isSouthEarthCrs,
  isValidEarthCrs,
} from "./zones";

/**
 * WGS84 UTM (proj4 `etmerc`) and UPS (ellipsoidal polar `stere`, as EPSG:32661/32761) through
 * proj4 projection objects built lazily, once per CRS. Calling the projection directly on a
 * reused point skips the converter's per-call allocations; for WGS84 → WGS84 the converter's
 * datum step is the identity, so results equal `proj4("EPSG:4326", def)`.
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const projections: (EarthProj4Projection | null | undefined)[] = [];
const point = { x: 0, y: 0 };

/** proj4 definition of an Earth CRS, or null for an invalid id. */
export function getEarthProj4Definition(crs: LgrsCrsId): string | null {
  if (!isValidEarthCrs(crs)) return null;
  if (crs === EARTH_CRS_UPS_SOUTH || crs === EARTH_CRS_UPS_NORTH) {
    const lat = crs === EARTH_CRS_UPS_NORTH ? 90 : -90;
    return (
      `+proj=stere +lat_0=${lat} +lat_ts=${lat} +lon_0=0 +k=${UPS_K0} ` +
      `+x_0=${UPS_FALSE_EASTING} +y_0=${UPS_FALSE_NORTHING} +datum=WGS84 +units=m +no_defs`
    );
  }
  const south = isSouthEarthCrs(crs) ? " +south" : "";
  return `+proj=utm +zone=${getUtmZone(crs)}${south} +datum=WGS84 +units=m +no_defs`;
}

function getProjection(crs: LgrsCrsId): EarthProj4Projection | null {
  const cached = projections[crs];
  if (cached !== undefined) return cached;
  const definition = getEarthProj4Definition(crs);
  let projection: EarthProj4Projection | null = null;
  if (definition) {
    try {
      projection = proj4.Proj(definition) as unknown as EarthProj4Projection;
    } catch {
      projection = null;
    }
  }
  projections[crs] = projection;
  return projection;
}

/**
 * Project lat/lon (degrees) into `crs`, writing `[E, N]`. Any valid crs may be used, so a point
 * can be projected into a neighbouring zone. Returns false for invalid input or a non-finite
 * result. Does not check that the point lies in the crs's own region.
 */
export function projectEarthLatLon(
  lat: number,
  lon: number,
  crs: LgrsCrsId,
  out: Float64Array
): boolean {
  if (!(lat >= -90 && lat <= 90) || !Number.isFinite(lon) || !isValidEarthCrs(crs)) return false;
  const projection = getProjection(crs);
  if (!projection) return false;
  point.x = conformEarthLongitude(lon) * DEG_TO_RAD;
  point.y = lat * DEG_TO_RAD;
  const result = projection.forward(point);
  if (!result || !Number.isFinite(result.x) || !Number.isFinite(result.y)) return false;
  out[0] = result.x;
  out[1] = result.y;
  return true;
}

/** Inverse of `projectEarthLatLon`, writing `[lat, lon]` with lon conformed to [-180, 180). */
export function unprojectEarthToLatLon(
  e: number,
  n: number,
  crs: LgrsCrsId,
  out: Float64Array
): boolean {
  if (!Number.isFinite(e) || !Number.isFinite(n) || !isValidEarthCrs(crs)) return false;
  const projection = getProjection(crs);
  if (!projection) return false;
  point.x = e;
  point.y = n;
  const result = projection.inverse(point);
  if (!result || !Number.isFinite(result.x) || !Number.isFinite(result.y)) return false;
  out[0] = result.y * RAD_TO_DEG;
  out[1] = conformEarthLongitude(result.x * RAD_TO_DEG);
  return true;
}
