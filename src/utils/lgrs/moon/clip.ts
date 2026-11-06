import {
  LGRS_MOON_RADIUS,
  LTM_FALSE_EASTING,
  LTM_FALSE_NORTHING_NORTH,
  LTM_FALSE_NORTHING_SOUTH,
  LTM_K0,
  LTM_MAX_ABS_LATITUDE,
  LTM_ZONE_WIDTH_DEGREES,
} from "./constants";
import { isSouthCrs } from "./crs";

// Closed-form LTM zone geometry for the dynamic grid.

const DEG_TO_RAD = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const LTM_K0R = LTM_K0 * LGRS_MOON_RADIUS;
const HALF_ZONE_RADIANS = (LTM_ZONE_WIDTH_DEGREES / 2) * DEG_TO_RAD;
const TAN_HALF_ZONE = Math.tan(HALF_ZONE_RADIANS);
const SIN_MAX_LATITUDE = Math.sin(LTM_MAX_ABS_LATITUDE * DEG_TO_RAD);

/** Widest LTM easting offset from the false easting (zone edge at the equator). */
const LTM_HALF_WIDTH = LTM_K0R * Math.atanh(Math.sin(HALF_ZONE_RADIANS));
/** Largest LTM northing offset from the false northing (zone edge at ±80°). */
const LTM_MAX_NORTHING_OFFSET =
  LTM_K0R * Math.atan2(Math.tan(LTM_MAX_ABS_LATITUDE * DEG_TO_RAD), Math.cos(HALF_ZONE_RADIANS));

export function getLtmFalseNorthing(crs: LgrsCrsId): number {
  return isSouthCrs(crs) ? LTM_FALSE_NORTHING_SOUTH : LTM_FALSE_NORTHING_NORTH;
}

/** E/N bounding box of a whole LTM region, written to `out` as `[minE, minN, maxE, maxN]`. */
export function getLtmRegionBounds(crs: LgrsCrsId, out: Float64Array): void {
  const falseNorthing = getLtmFalseNorthing(crs);
  const south = isSouthCrs(crs);
  out[0] = LTM_FALSE_EASTING - LTM_HALF_WIDTH;
  out[1] = south ? falseNorthing - LTM_MAX_NORTHING_OFFSET : falseNorthing;
  out[2] = LTM_FALSE_EASTING + LTM_HALF_WIDTH;
  out[3] = south ? falseNorthing : falseNorthing + LTM_MAX_NORTHING_OFFSET;
}

/**
 * Parts of the constant-easting (`axis` "easting") or constant-northing line `value` that lie in
 * the LTM region of `crs`, as `[from, to]` ranges of the other coordinate written to `out`
 * (length ≥ 4). Returns the number of parts (0–2). LTM regions are `|Δλ| ≤ 4°`, `|lat| ≤ 80°` and
 * the crs hemisphere; with `u = (E − FE)/(k₀R)` and `D = (N − FN)/(k₀R)`,
 * `lat = asin(sin D / cosh u)` and `Δλ = atan2(sinh u, cos D)`, so every boundary crossing has a
 * closed form.
 */
export function clipLtmGridLine(
  crs: LgrsCrsId,
  axis: "easting" | "northing",
  value: number,
  out: Float64Array
): number {
  const falseNorthing = getLtmFalseNorthing(crs);
  const south = isSouthCrs(crs);
  if (axis === "easting") {
    const u = (value - LTM_FALSE_EASTING) / LTM_K0R;
    const zoneCos = Math.sinh(Math.abs(u)) / TAN_HALF_ZONE;
    if (!(zoneCos <= 1)) return 0;
    const latitudeSin = SIN_MAX_LATITUDE * Math.cosh(u);
    const maxD = Math.min(Math.acos(zoneCos), latitudeSin >= 1 ? HALF_PI : Math.asin(latitudeSin));
    out[0] = south ? falseNorthing - LTM_K0R * maxD : falseNorthing;
    out[1] = south ? falseNorthing : falseNorthing + LTM_K0R * maxD;
    return 1;
  }

  const d = (value - falseNorthing) / LTM_K0R;
  if (south ? !(d < 0) : !(d >= 0)) return 0;
  if (Math.abs(d) > HALF_PI) return 0;
  const maxU = Math.asinh(TAN_HALF_ZONE * Math.cos(d));
  const latitudeRatio = Math.abs(Math.sin(d)) / SIN_MAX_LATITUDE;
  if (latitudeRatio <= 1) {
    out[0] = LTM_FALSE_EASTING - LTM_K0R * maxU;
    out[1] = LTM_FALSE_EASTING + LTM_K0R * maxU;
    return 1;
  }
  // Above 80° on the central meridian: the line re-enters the region towards the zone edges.
  const minU = Math.acosh(latitudeRatio);
  if (minU >= maxU) return 0;
  out[0] = LTM_FALSE_EASTING - LTM_K0R * maxU;
  out[1] = LTM_FALSE_EASTING - LTM_K0R * minU;
  out[2] = LTM_FALSE_EASTING + LTM_K0R * minU;
  out[3] = LTM_FALSE_EASTING + LTM_K0R * maxU;
  return 2;
}
