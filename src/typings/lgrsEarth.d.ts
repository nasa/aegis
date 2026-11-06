/** Earth ACC box sizes in metres; 25000 is the 25 km sub-area (prefix only). */
type EarthAccPrecision = 1 | 10 | 100 | 1000 | 25000;

/** MGRS box sizes in metres; 100000 is the 100 km square (prefix only). */
type EarthMgrsPrecision = 1 | 10 | 100 | 1000 | 10000 | 100000;

type EarthGridPrecision = EarthAccPrecision | EarthMgrsPrecision;

/** `LgrsLabel` with the precision widened to the MGRS box sizes. */
type EarthGridLabel = Omit<LgrsLabel, "precision"> & { precision: EarthGridPrecision };

/**
 * A lat/lon rectangle owned by an Earth CRS: lat `[south, north)` and lon `[west, east)`, except
 * that the UPS North slice includes the pole (lat 90).
 */
type EarthRegionSlice = {
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
};

/** Zone/band and 100 km square of a projected point, plus its integer metres in the square. */
type MgrsParts = {
  /** `15R` for UTM, `A`/`B`/`Y`/`Z` for UPS. */
  zoneBand: string;
  /** 100 km square letters, e.g. `TN`. */
  square: string;
  /** floor(E) mod 100,000. */
  easting: number;
  /** floor(N) mod 100,000. */
  northing: number;
};

/** The `proj4.Proj` methods used by `earth/projection` (radians in and out, mutating `p`). */
type EarthProj4Projection = {
  forward(p: { x: number; y: number }): { x: number; y: number } | undefined;
  inverse(p: { x: number; y: number }): { x: number; y: number } | undefined;
};
