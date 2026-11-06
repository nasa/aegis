/**
 * LGRS projection parameters and letter tables (USGS TM 11-E1 "M2025", as implemented by the
 * pinned Python `lgrs` 0.4.0 reference in `lgrs/srs/wkt.py` and `lgrs/coords.py`).
 * Tables are plain strings indexed by integer.
 */

/** IAU 2015 lunar sphere radius (m). */
export const LGRS_MOON_RADIUS = 1737400;

export const LTM_K0 = 0.999;
export const LTM_FALSE_EASTING = 250000;
export const LTM_FALSE_NORTHING_NORTH = 0;
export const LTM_FALSE_NORTHING_SOUTH = 2500000;
export const LTM_ZONE_COUNT = 45;
export const LTM_ZONE_WIDTH_DEGREES = 8;
/** |lat| below this is LTM, at or above it is LPS. */
export const LTM_MAX_ABS_LATITUDE = 80;

export const LPS_K0 = 0.994;
export const LPS_FALSE_EASTING = 500000;
export const LPS_FALSE_NORTHING = 500000;

/** LPS easting/northing distance from the pole to the ±80° parallel. */
export const LPS_DOMAIN_RADIUS =
  2 * LGRS_MOON_RADIUS * LPS_K0 * Math.tan(((90 - LTM_MAX_ABS_LATITUDE) * Math.PI) / 360);
export const LPS_DOMAIN_TOLERANCE_METERS = 1e-6;

/** Projected values within this distance of an integer snap to it (LPS only). */
export const LPS_INTEGER_TOLERANCE_METERS = 1e-9;

/** Tolerance on LTM membership at the ±80° parallel and zone meridians (≈ 0.03 mm). */
export const LTM_DOMAIN_TOLERANCE_DEGREES = 1e-9;

export const LGRS_AREA_METERS = 25000;

/** LPS 25 km easting area letters (M2025 Tables 13, 14). */
export const LPS_EASTING_AREA_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
/** LPS 25 km northing area letters (M2025 Tables 15, 16). */
export const LPS_NORTHING_AREA_LETTERS = "-ABCDEFGHJKLMNPQRSTUVWXYZ+";
/** LTM latitude band letters, indexed by floor(lat / 8) + 11 (M2025 Table 6). */
export const LTM_LATITUDE_BAND_LETTERS = "CCDEFGHJKLMNPQRSTUVWXX";
/** LTM 25 km easting area letters, indexed by floor(E / 25000) − 5 (M2025 Table 7). */
export const LTM_EASTING_AREA_LETTERS = "ABCDEFGHJK";
/** LTM 25 km northing area letter sets, indexed by (zone − 1) % 3 (M2025 Tables 8–10). */
export const LTM_NORTHING_AREA_LETTER_SETS = [
  "ABCDEFGHJKLMNPQRSTUV",
  "FGHJKLMNPQRSTUVABCDE",
  "LMNPQRSTUVABCDEFGHJK",
] as const;
/** ACC 1 km letters, indexed by the first two within-area digits (M2025 Table 17). */
export const ACC_1KM_LETTERS = "-ABCDEFGHJKLMNPQRSTUVWXYZ";

export const LGRS_PRECISIONS: readonly LgrsPrecision[] = [25000, 1000, 100, 10, 1];
