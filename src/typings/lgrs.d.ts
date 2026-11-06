/**
 * Grid CRS id, meaningful only together with its `LgrsGridSystem`: a system's valid ids are the
 * integers 0 … n − 1, and −1 is invalid in every system. Moon (`moon-m2025`): 0 = LPS South, 1 = LPS
 * North, 2 + (zone − 1)·2 + (hemisphere S ? 1 : 0) = LTM zone/hemisphere (helpers in
 * `utils/lgrs/moon/crs`).
 */
type LgrsCrsId = number;

type LgrsHemisphere = "N" | "S";

/**
 * Box size in metres. 25000 is the lunar/ACC 25 km area and 100000 the MGRS 100 km square
 * (prefix only); 10000 is the MGRS 10 km box.
 */
type LgrsPrecision = 1 | 10 | 100 | 1000 | 10000 | 25000 | 100000;

/** Lunar strings: full LGRS digits or the condensed ACC (1 km letter) form. */
type LgrsStringKind = "lgrs" | "acc";

/** Label scheme of a grid system: lunar ACC letters, or canonical MGRS. */
type GridLabelScheme = "lunar-acc" | "mgrs";

/** Grid system a mission uses. */
type MissionGridSystemId = "moon-m2025" | "earth-wgs84";

type LgrsCoordinate = [easting: number, northing: number];

type LgrsExtent = [
  minEasting: number,
  minNorthing: number,
  maxEasting: number,
  maxNorthing: number,
];

type LgrsLabel = {
  /** Digit form of the box reference (lunar: full LGRS digits). */
  lgrs: string;
  /** Letter form of the box reference (lunar: ACC). */
  acc: string;
  /** Zone/band and area letters, e.g. `BAN`, `23NFF`, `4NAA`. */
  prefix: string;
  /** `acc` without `prefix`. */
  condensed: string;
  /** Text drawn on the map, e.g. `"<easting> <northing>"` in condensed ACC, or `prefix` alone. */
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
 * Map CRS ↔ lat/lon conversions for one map projection, independent of any grid system. All
 * methods write into a caller-owned `Float64Array(2)` and return false (leaving `out`
 * unspecified) when the input or result is not finite or the projection cannot be built.
 */
interface LgrsMapProjector {
  readonly projection: LgrsMapProjection;
  /** proj4's parsed parameters for the projection, or null when proj4 cannot build it. */
  readonly params: LgrsProj4Params | null;
  /** Horizontal repeat distance for Mercator/equirectangular maps, otherwise null. */
  readonly worldWidth: number | null;
  /** Closed-form path in use (verified against proj4), or null when every call uses proj4. */
  readonly fastPath: LgrsMapFastPath | null;
  /** Map → `[lat, lon]`, identical to `proj4(projCode, "EPSG:4326")` (longitude not conformed). */
  mapToLatLon(x: number, y: number, out: Float64Array): boolean;
  /** `[lat, lon]` → map `[x, y]`, identical to `proj4("EPSG:4326", projCode)`. */
  latLonToMap(lat: number, lon: number, out: Float64Array): boolean;
}

/**
 * A map projection bound to a grid system: the projector's conversions plus map ↔ grid E/N in
 * the system's CRSs. Every grid conversion returns false for a CRS the system does not define.
 */
interface LgrsGridBinding extends LgrsMapProjector {
  readonly system: LgrsGridSystem;
  /** Map → `[E, N]` in `crs` (the affine relation when there is one, otherwise via lat/lon). */
  mapToGrid(x: number, y: number, crs: LgrsCrsId, out: Float64Array): boolean;
  /** `[E, N]` in `crs` → map `[x, y]`. */
  gridToMap(e: number, n: number, crs: LgrsCrsId, out: Float64Array): boolean;
  /** The affine map → `crs` relation, or null when the map CRS is not affine to `crs`. */
  getAffine(crs: LgrsCrsId): LgrsMapAffine | null;
}

/** Polar cap region: the disc of projected points within `radius` of the pole. */
type LgrsCap = {
  /** Projected coordinates of the pole (the cap projection's false easting and northing). */
  centreE: number;
  centreN: number;
  /** Projected distance from the pole to the cap's limiting parallel, in metres. */
  radius: number;
};

/** A framework line (seam or zone-tier line) in geographic coordinates. */
type LgrsFrameworkLine = {
  kind: LgrsRenderLineKind;
  axis: "meridian" | "parallel";
  /**
   * Meridian longitude or parallel latitude in degrees. Meridian longitudes may lie outside
   * [-180, 180) so they stay inside an envelope that crosses the antimeridian.
   */
  value: number;
  /** Latitude range of a meridian, or longitude range of a parallel; drawn only if from < to. */
  from: number;
  to: number;
};

/** A zone-tier label anchored at a geographic point. */
type LgrsZoneLabel = {
  lat: number;
  lon: number;
  crs: LgrsCrsId;
  text: string;
};

/**
 * A planetary grid (projections, CRS ids, labels and region geometry) behind which the
 * planner, map binding, readouts and bearings are body-neutral. Point inputs are degrees,
 * projected values metres. Methods that write to `out` take a caller-owned `Float64Array` and
 * leave it unspecified when they return false. Implementations must not allocate on the
 * per-point paths (`classifyLatLon`, `projectLatLon`, `unprojectToLatLon`, `formatPoint`).
 */
interface LgrsGridSystem {
  /**
   * Cache key: system id plus configuration, e.g. `moon-m2025` or `earth-wgs84/mgrs`. Two
   * systems with the same key behave identically; every cache of system-dependent results
   * includes it.
   */
  readonly key: string;
  /** The mission grid system this instance implements. */
  readonly id: MissionGridSystemId;
  readonly scheme: GridLabelScheme;

  // * CRS ids

  /** Whether `crs` is one of this system's CRS ids (the integers 0 … n − 1). */
  isValidCrs(crs: LgrsCrsId): boolean;
  /** Short CRS name for display, e.g. `23N` or `LPS S`; `""` for an invalid id. */
  formatCrsName(crs: LgrsCrsId): string;
  /**
   * Point semantics: the CRS that owns `[lat, lon]`, or −1 for invalid input. Boundaries are
   * half-open and exact (no tolerance). Longitudes outside [-180, 180) are conformed first.
   */
  classifyLatLon(lat: number, lon: number): LgrsCrsId;
  /** Whether `[lat, lon]` lies in the region of `crs`, i.e. `classifyLatLon(lat, lon) === crs`. */
  isInRegion(lat: number, lon: number, crs: LgrsCrsId): boolean;

  // * Projection

  /**
   * Project `[lat, lon]` into `crs`, writing `[E, N]`. Any valid crs may be used, so a point can
   * be projected into a neighbouring region; membership is not checked. False for invalid input
   * or a non-finite result.
   */
  projectLatLon(lat: number, lon: number, crs: LgrsCrsId, out: Float64Array): boolean;
  /** Inverse of `projectLatLon`, writing `[lat, lon]` with lon conformed to [-180, 180). */
  unprojectToLatLon(e: number, n: number, crs: LgrsCrsId, out: Float64Array): boolean;
  /**
   * The affine map → `crs` relation of a map projection, or null. `params` are proj4's parsed
   * parameters and `fastPath` the verified closed-form path the map projector uses (null when
   * it calls proj4). A relation must be exact for the conversions the projector performs, so a
   * system whose grid projection is closed-form may require a matching `fastPath`.
   */
  getAffine(
    params: LgrsProj4Params | null,
    fastPath: LgrsMapFastPath | null,
    crs: LgrsCrsId
  ): LgrsMapAffine | null;

  // * Labels

  /**
   * Readout string (mouse, panes, exports) for `[lat, lon]` in its own CRS at `precision`, with
   * point semantics: digits are truncated from the point's projected E/N and bands come from
   * the point's latitude. `"condensed"` is the within-area part (e.g. `B95 D44`); `"full"`
   * prefixes the zone/band and area letters (e.g. `AZM B95 D44`). At a prefix-only precision
   * both styles give the prefix. Null for invalid or unformattable input.
   */
  formatPoint(
    lat: number,
    lon: number,
    precision: LgrsPrecision,
    style: LgrsDisplayStyle
  ): string | null;
  /**
   * Label of the `precision` box whose grid-southwest corner is `[lowerLeftE, lowerLeftN]` in
   * `crs` (box semantics; the corner is a multiple of `precision`). Null when the system does
   * not label that box, e.g. the Moon's corner lies outside the region.
   */
  formatBox(
    lowerLeftE: number,
    lowerLeftN: number,
    crs: LgrsCrsId,
    precision: LgrsPrecision
  ): LgrsLabel | null;
  /**
   * Labelled box sizes in metres, finest first. Each is a multiple of the previous one. The
   * last is the prefix-only area (25 km ACC, 100 km MGRS square) and the coarsest box-tier
   * spacing; the others carry digits and are the fixed spacings offered in the map menu. Label
   * precision is the coarsest of these dividing the label spacing, else 1 m.
   */
  getBoxSpacings(): readonly LgrsPrecision[];

  // * Region geometry

  /**
   * Regions that may be visible in the view, in drawing order. `envelope` bounds the view in
   * lat/lon; `samples` are the classified view samples it was built from.
   */
  getCandidateRegions(envelope: LgrsViewEnvelope, samples: LgrsViewSamples): LgrsCrsId[];
  /** The polar cap of `crs`, or null for a zone region. Caps are clipped by shared code. */
  getCap(crs: LgrsCrsId): LgrsCap | null;
  /**
   * E/N bounding box `[minE, minN, maxE, maxN]` of a whole zone region (not called for caps).
   * May overestimate, never underestimate.
   */
  getRegionBounds(crs: LgrsCrsId, out: Float64Array): void;
  /**
   * Parts of the constant-easting (`axis` "easting") or constant-northing line `value` inside
   * the zone region `crs`, as sorted, disjoint `[from, to]` ranges of the other coordinate
   * written to `out` (length ≥ 6). Returns the part count (0–3; the Moon's LTM zones give at
   * most 2, Earth's zone 31N up to 3). Not called for caps.
   */
  clipGridLine(
    crs: LgrsCrsId,
    axis: "easting" | "northing",
    value: number,
    out: Float64Array
  ): number;
  /**
   * Central meridian (degrees) of a zone region, which keeps unprojected longitudes continuous
   * across the region (e.g. a zone ending at 180°); NaN for caps.
   */
  getCentralMeridian(crs: LgrsCrsId): number;
  /** Whether a region grid line coincides with a framework seam (e.g. the equator) and is skipped. */
  isSeamGridLine(crs: LgrsCrsId, axis: "easting" | "northing", value: number): boolean;

  // * Framework and zone tier

  /** Whether the zone tier (continental zoom) is drawn; otherwise the grid is hidden there. */
  readonly drawsZoneTier: boolean;
  /**
   * Framework lines inside `envelope`, in drawing order: the seams (zone boundaries and region
   * limits, kind `seam`), plus, when `zoneTier`, the zone-tier lines (band parallels, cap
   * splits). Lines may extend past the envelope; the planner clips them.
   */
  getFrameworkLines(envelope: LgrsViewEnvelope, zoneTier: boolean): LgrsFrameworkLine[];
  /** Zone-tier labels in priority order (earlier labels win when decluttering). */
  getZoneLabels(envelope: LgrsViewEnvelope): LgrsZoneLabel[];

  // * Missions

  /** Null when a mission with this planet radius can use the system, otherwise the reason. */
  checkPlanetRadius(planetRadius: number | null | undefined): string | null;
}

/** A mission's resolved grid system and whether its dynamic grid can be drawn. */
type LgrsMissionGridSystem = {
  system: LgrsGridSystem;
  compatibility: LgrsCompatibility;
};

/** Mission fields that select its grid system (none yet: every mission is lunar). */
type LgrsMissionGridSelection = Pick<Mission, never>;

/** Mission fields that select and gate its grid system. */
type LgrsMissionGridFields = LgrsMissionGridSelection &
  Pick<Mission, "id" | "planetRadius" | "projIsCustom" | "projEpsg" | "projProj4String">;

/** proj4 `Proj` fields read to select and run a closed-form fast path or match a grid CRS. */
type LgrsProj4Params = {
  /** proj4 datum; `datum_type` 4 (`PJD_WGS84`) and 5 (`PJD_NODATUM`) convert without a shift. */
  datum?: { datum_type?: number };
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
