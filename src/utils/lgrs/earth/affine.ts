import {
  UPS_FALSE_EASTING,
  UPS_FALSE_NORTHING,
  UPS_K0,
  UTM_FALSE_EASTING,
  UTM_FALSE_NORTHING_NORTH,
  UTM_FALSE_NORTHING_SOUTH,
  UTM_K0,
  WGS84_FLATTENING,
  WGS84_SEMI_MAJOR_AXIS,
} from "./constants";
import { projectEarthLatLon } from "./projection";
import {
  EARTH_CRS_UPS_NORTH,
  getUtmCentralMeridian,
  getUtmZone,
  isSouthEarthCrs,
  isUpsCrs,
} from "./zones";

const D2R = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const WGS84_ES = WGS84_FLATTENING * (2 - WGS84_FLATTENING);
/** proj4 datum types that convert to EPSG:4326 without a shift (`PJD_WGS84`, `PJD_NODATUM`). */
const UNSHIFTED_DATUM_TYPES = [4, 5];
/** proj4 projections that run the Poder/Engsager (`etmerc`) series the UTM grid uses. */
const ETMERC_NAMES = ["utm", "etmerc", "tmerc"];
/** Largest affine error accepted at the probes (m). */
const AFFINE_TOLERANCE_METERS = 1e-6;

const UTM_PROBE_LATITUDES = [-79.9, -60, -20, -0.5, 0, 0.5, 20, 60, 83.9];
const UTM_PROBE_OFFSETS = [-6, -3, -1.5, 0, 1, 3, 6];
const UPS_PROBE_LATITUDES = [80, 84, 86, 88, 89.9];
const UPS_PROBE_LONGITUDES = [-180, -135, -90, -10, 0, 45, 90, 179.9];

const mapPoint = { x: 0, y: 0 };
const gridOut = new Float64Array(2);

/** Whether a map CRS is on the WGS84 ellipsoid, in metres, east/north, with no datum shift. */
function isPlainWgs84(params: LgrsProj4Params): boolean {
  return (
    !params.sphere &&
    params.a === WGS84_SEMI_MAJOR_AXIS &&
    Math.abs((params.es ?? 0) - WGS84_ES) < 1e-15 &&
    (params.axis === undefined || params.axis === "enu") &&
    (params.to_meter === undefined || params.to_meter === 1) &&
    !params.from_greenwich &&
    !params.over &&
    UNSHIFTED_DATUM_TYPES.includes(params.datum?.datum_type ?? 5)
  );
}

/** Whether `affine` reproduces the grid projection at every probe the map projection takes. */
function verifyAffine(
  params: LgrsProj4Params,
  affine: LgrsMapAffine,
  probes: [lat: number, lon: number][]
): boolean {
  const projection = params as unknown as EarthProj4Projection;
  for (const [lat, lon] of probes) {
    if (!projectEarthLatLon(lat, lon, affine.crs, gridOut)) return false;
    mapPoint.x = lon * D2R;
    mapPoint.y = lat * D2R;
    const map = projection.forward(mapPoint);
    if (!map || !Number.isFinite(map.x) || !Number.isFinite(map.y)) return false;
    const e = map.x * affine.scale + affine.offsetE;
    const n = map.y * affine.scale + affine.offsetN;
    if (!(Math.abs(e - gridOut[0]) <= AFFINE_TOLERANCE_METERS)) return false;
    if (!(Math.abs(n - gridOut[1]) <= AFFINE_TOLERANCE_METERS)) return false;
  }
  return true;
}

function getUtmAffine(params: LgrsProj4Params, crs: LgrsCrsId): LgrsMapAffine | null {
  if (!ETMERC_NAMES.includes(params.projName ?? "") || params.approx || params.lat0 !== 0) {
    return null;
  }
  const zone = getUtmZone(crs);
  const centralMeridian = getUtmCentralMeridian(zone);
  if (Math.abs(params.long0 - centralMeridian * D2R) > 1e-12) return null;
  const scale = UTM_K0 / params.k0;
  const falseNorthing = isSouthEarthCrs(crs) ? UTM_FALSE_NORTHING_SOUTH : UTM_FALSE_NORTHING_NORTH;
  const affine: LgrsMapAffine = {
    crs,
    scale,
    offsetE: UTM_FALSE_EASTING - scale * params.x0,
    offsetN: falseNorthing - scale * params.y0,
  };
  const probes: [number, number][] = [];
  for (const lat of UTM_PROBE_LATITUDES) {
    for (const offset of UTM_PROBE_OFFSETS) probes.push([lat, centralMeridian + offset]);
  }
  return verifyAffine(params, affine, probes) ? affine : null;
}

function getUpsAffine(params: LgrsProj4Params, crs: LgrsCrsId): LgrsMapAffine | null {
  const north = crs === EARTH_CRS_UPS_NORTH;
  if (params.projName !== "stere" || params.long0 !== 0) return null;
  if (params.lat0 !== (north ? HALF_PI : -HALF_PI)) return null;
  const scale = UPS_K0 / params.k0;
  const affine: LgrsMapAffine = {
    crs,
    scale,
    offsetE: UPS_FALSE_EASTING - scale * params.x0,
    offsetN: UPS_FALSE_NORTHING - scale * params.y0,
  };
  const probes: [number, number][] = [];
  for (const lat of UPS_PROBE_LATITUDES) {
    for (const lon of UPS_PROBE_LONGITUDES) probes.push([north ? lat : -lat, lon]);
  }
  return verifyAffine(params, affine, probes) ? affine : null;
}

/**
 * Affine map → `crs` relation of an Earth map projection. Only a map that runs the grid's own
 * proj4 math qualifies: a WGS84 ellipsoidal `etmerc` (`utm`, or `tmerc` without `+approx`) on a
 * UTM central meridian with `lat_0 = 0`, which is affine to both hemispheres of that zone, or a
 * WGS84 polar `stere` on the 0° meridian, affine to its UPS cap. Both differ from the grid CRS
 * only by scale (k₀) and false origin, and the relation is checked at probes to 1 µm. The
 * spherical fast paths never qualify, since the grid is ellipsoidal.
 */
export function getEarthAffine(
  params: LgrsProj4Params | null,
  fastPath: LgrsMapFastPath | null,
  crs: LgrsCrsId
): LgrsMapAffine | null {
  if (!params || fastPath !== null || !isPlainWgs84(params)) return null;
  if (![params.k0, params.x0, params.y0, params.lat0, params.long0].every(Number.isFinite)) {
    return null;
  }
  if (isUpsCrs(crs)) return getUpsAffine(params, crs);
  return getUtmZone(crs) === 0 ? null : getUtmAffine(params, crs);
}
