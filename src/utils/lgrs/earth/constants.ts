/**
 * WGS84 UTM/UPS parameters and MGRS letter tables (NGA MGRS, WGS84 "AA" lettering; polar tables
 * as in GeoTrans `UPS_Constant_Table`). Tables are plain strings indexed by integer.
 */

export const WGS84_SEMI_MAJOR_AXIS = 6378137;
export const WGS84_INVERSE_FLATTENING = 298.257223563;
export const WGS84_FLATTENING = 1 / WGS84_INVERSE_FLATTENING;

export const UTM_K0 = 0.9996;
export const UTM_FALSE_EASTING = 500000;
export const UTM_FALSE_NORTHING_NORTH = 0;
export const UTM_FALSE_NORTHING_SOUTH = 10000000;
export const UTM_ZONE_COUNT = 60;
export const UTM_ZONE_WIDTH_DEGREES = 6;
/** UTM owns `[UTM_MIN_LATITUDE, UTM_MAX_LATITUDE)`; UPS owns the rest. */
export const UTM_MIN_LATITUDE = -80;
export const UTM_MAX_LATITUDE = 84;

export const UPS_K0 = 0.994;
export const UPS_FALSE_EASTING = 2000000;
export const UPS_FALSE_NORTHING = 2000000;

export const MGRS_SQUARE_METERS = 100000;
export const EARTH_ACC_AREA_METERS = 25000;

/** MGRS latitude bands, indexed by floor(lat / 8) + 10; X covers [72, 84). */
export const MGRS_LATITUDE_BAND_LETTERS = "CDEFGHJKLMNPQRSTUVWX";
/** Height of every band except X (degrees). */
export const MGRS_BAND_HEIGHT_DEGREES = 8;

/** UTM 100 km column letters, indexed by floor(E / 100000) − 1, set by (zone − 1) % 3. */
export const MGRS_COLUMN_LETTER_SETS = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"] as const;
/** UTM 100 km row letters, indexed by floor(N / 100000) mod 20 (+ 5 in even zones). */
export const MGRS_ROW_LETTERS = "ABCDEFGHJKLMNPQRSTUV";
export const MGRS_EVEN_ZONE_ROW_OFFSET = 5;

/** UPS west half (bands A and Y) column letters, from E = 800,000. */
export const UPS_WEST_COLUMN_LETTERS = "JKLPQRSTUXYZ";
export const UPS_WEST_COLUMN_ORIGIN = 800000;
/** UPS east half (bands B and Z) column letters, from E = 2,000,000. */
export const UPS_EAST_COLUMN_LETTERS = "ABCFGHJKLPQR";
export const UPS_EAST_COLUMN_ORIGIN = 2000000;
/** UPS South (bands A and B) row letters, from N = 800,000. */
export const UPS_SOUTH_ROW_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const UPS_SOUTH_ROW_ORIGIN = 800000;
/** UPS North (bands Y and Z) row letters, from N = 1,300,000. */
export const UPS_NORTH_ROW_LETTERS = "ABCDEFGHJKLMNP";
export const UPS_NORTH_ROW_ORIGIN = 1300000;

/** 25 km sub-area letters within a 100 km square, indexed by floor((v mod 100000) / 25000). */
export const EARTH_ACC_SUB_AREA_LETTERS = "ABCD";
/** ACC 1 km letters, indexed by floor((v mod 25000) / 1000) (lunar M2025 Table 17). */
export const EARTH_ACC_1KM_LETTERS = "-ABCDEFGHJKLMNPQRSTUVWXYZ";

export const EARTH_ACC_PRECISIONS: readonly EarthAccPrecision[] = [25000, 1000, 100, 10, 1];
export const EARTH_MGRS_PRECISIONS: readonly EarthMgrsPrecision[] = [
  100000, 10000, 1000, 100, 10, 1,
];
