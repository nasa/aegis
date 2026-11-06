import {
  LGRS_MOON_RADIUS,
  LPS_FALSE_EASTING,
  LPS_FALSE_NORTHING,
  LPS_K0,
  LTM_FALSE_EASTING,
  LTM_FALSE_NORTHING_NORTH,
  LTM_FALSE_NORTHING_SOUTH,
  LTM_K0,
  LTM_ZONE_COUNT,
} from "./constants";
import {
  getLtmCentralMeridian,
  getLtmZone,
  isSouthCrs,
  LGRS_CRS_LPS_NORTH,
  LGRS_CRS_LPS_SOUTH,
} from "./crs";

const R2D = 180 / Math.PI;

/** LTM zone whose central meridian is `longitude` (degrees), or 0. */
function getZoneWithCentralMeridian(longitude: number): number {
  for (let zone = 1; zone <= LTM_ZONE_COUNT; zone++) {
    if (Math.abs(getLtmCentralMeridian(zone) - longitude) <= 1e-9) return zone;
  }
  return 0;
}

/**
 * Affine map → `crs` relation for a map projection on the lunar sphere. Only the verified
 * closed-form paths qualify, since the grid projections are those same closed forms: a polar
 * stereographic map on the 0° meridian is affine to its LPS cap, and a `+approx` TM map on an
 * LTM central meridian (`lat_0 = 0`) is affine to both hemispheres of that zone.
 */
export function getMoonAffine(
  params: LgrsProj4Params | null,
  fastPath: LgrsMapFastPath | null,
  crs: LgrsCrsId
): LgrsMapAffine | null {
  if (!params || params.a !== LGRS_MOON_RADIUS) return null;
  if (fastPath === "stere-polar" && params.long0 === 0) {
    if (crs !== (params.lat0 > 0 ? LGRS_CRS_LPS_NORTH : LGRS_CRS_LPS_SOUTH)) return null;
    const scale = LPS_K0 / params.k0;
    return {
      crs,
      scale,
      offsetE: LPS_FALSE_EASTING - scale * params.x0,
      offsetN: LPS_FALSE_NORTHING - scale * params.y0,
    };
  }
  if (fastPath === "tmerc" && params.lat0 === 0) {
    const zone = getZoneWithCentralMeridian(params.long0 * R2D);
    if (zone === 0 || getLtmZone(crs) !== zone) return null;
    const scale = LTM_K0 / params.k0;
    const falseNorthing = isSouthCrs(crs) ? LTM_FALSE_NORTHING_SOUTH : LTM_FALSE_NORTHING_NORTH;
    return {
      crs,
      scale,
      offsetE: LTM_FALSE_EASTING - scale * params.x0,
      offsetN: falseNorthing - scale * params.y0,
    };
  }
  return null;
}
