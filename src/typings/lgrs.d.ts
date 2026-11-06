/**
 * LGRS CRS id: 0 = LPS South, 1 = LPS North, 2 + (zone − 1)·2 + (hemisphere S ? 1 : 0) = LTM
 * zone/hemisphere, −1 = invalid. Use the helpers in `utils/lgrs/crs`.
 */
type LgrsCrsId = number;

type LgrsHemisphere = "N" | "S";

/** Box size in metres; 25000 is the 25 km area (prefix only). */
type LgrsPrecision = 1 | 10 | 100 | 1000 | 25000;

/** Full LGRS digits or the condensed ACC (1 km letter) form. */
type LgrsStringKind = "lgrs" | "acc";

type LgrsCoordinate = [easting: number, northing: number];

type LgrsExtent = [
  minEasting: number,
  minNorthing: number,
  maxEasting: number,
  maxNorthing: number,
];

type LgrsLabel = {
  lgrs: string;
  acc: string;
  /** Zone/band and 25 km area letters, e.g. `BAN`, `23NFF`, `4NAA`. */
  prefix: string;
  /** `acc` without `prefix`. */
  condensed: string;
  /** `"<easting> <northing>"` in condensed ACC form, or `prefix` at 25 km. */
  text: string;
  /** Grid-southwest corner of the labelled box. */
  lowerLeft: LgrsCoordinate;
  precision: LgrsPrecision;
};

/**
 * The map CRS the app uses: `projCode` as registered with proj4/OL, and the proj4 definition
 * (null for codes proj4 knows natively, e.g. `EPSG:3857`).
 */
type LgrsMapProjection = {
  projCode: string;
  proj4Def: string | null;
};

/** Closed-form map ↔ lat/lon path, bit-identical to proj4 for that projection. */
type LgrsMapFastPath = "stere-polar" | "tmerc" | "merc";

/** `E = scale·x + offsetE`, `N = scale·y + offsetN` for map coordinate `[x, y]`. */
type LgrsMapAffine = {
  crs: LgrsCrsId;
  scale: number;
  offsetE: number;
  offsetN: number;
};

/**
 * Map CRS ↔ lat/lon ↔ LGRS conversions for one map projection. All methods write into a
 * caller-owned `Float64Array(2)` and return false (leaving `out` unspecified) when the input or
 * result is not finite or the projection cannot be built.
 */
interface LgrsMapAdapter {
  readonly projection: LgrsMapProjection;
  /** Horizontal repeat distance for Mercator/equirectangular maps, otherwise null. */
  readonly worldWidth: number | null;
  /** Closed-form path in use, or null when every call goes through proj4. */
  readonly fastPath: LgrsMapFastPath | null;
  /** Map → `[lat, lon]`, identical to `proj4(projCode, "EPSG:4326")` (longitude not conformed). */
  mapToLatLon(x: number, y: number, out: Float64Array): boolean;
  /** `[lat, lon]` → map `[x, y]`, identical to `proj4("EPSG:4326", projCode)`. */
  latLonToMap(lat: number, lon: number, out: Float64Array): boolean;
  /** Map → `[E, N]` in `crs` (affine when available, otherwise via lat/lon). */
  mapToLgrs(x: number, y: number, crs: LgrsCrsId, out: Float64Array): boolean;
  /** `[E, N]` in `crs` → map `[x, y]`. */
  lgrsToMap(e: number, n: number, crs: LgrsCrsId, out: Float64Array): boolean;
  /** The affine map → `crs` relation, or null when the map CRS is not affine to `crs`. */
  getAffine(crs: LgrsCrsId): LgrsMapAffine | null;
}

/** proj4 `Proj` fields read to select and run a closed-form fast path. */
type LgrsProj4Params = {
  projName?: string;
  sphere?: boolean;
  approx?: boolean;
  over?: boolean;
  axis?: string;
  to_meter?: number;
  from_greenwich?: number;
  es?: number;
  a: number;
  k0: number;
  x0: number;
  y0: number;
  lat0: number;
  long0: number;
  sinlat0?: number;
  coslat0?: number;
};

/** `"condensed"`: `B95 D44`; `"full"`: prefix + condensed, e.g. `AZM B95 D44`, `23NFF -00 -00`. */
type LgrsDisplayStyle = "condensed" | "full";

type LgrsFastPathFunctions = {
  /** lat/lon (radians) → map; false on failure. */
  forward(p: LgrsProj4Params, lat: number, lon: number, out: Float64Array): boolean;
  /** map → lat/lon (radians) in `out` as `[lat, lon]`; false on failure. */
  inverse(p: LgrsProj4Params, x: number, y: number, out: Float64Array): boolean;
};
