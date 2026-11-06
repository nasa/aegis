/** Map CRS extent `[minX, minY, maxX, maxY]`. */
type LgrsMapExtent = [minX: number, minY: number, maxX: number, maxY: number];

/** Grid line or label spacing in LGRS metres, or "auto" to derive it from the view. */
type LgrsGridSpacing = "auto" | number;

/** Hard limits on one render plan; exceeding one coarsens the spacing. */
type LgrsRenderCaps = {
  maxVertices: number;
  maxLines: number;
  maxLabels: number;
};

type LgrsRenderOptions = {
  adapter: LgrsMapAdapter;
  extent: LgrsMapExtent;
  /** Map units per screen pixel. */
  resolution: number;
  gridSpacingMode: LgrsGridSpacing;
  gridLabelInterval: LgrsGridSpacing;
  labelsVisible: boolean;
  /**
   * Spacing published by the dashboard. A minimap passes it to draw the same lines, coarsened
   * per region until adjacent lines are a few pixels apart. Replaces both spacing modes.
   */
  inheritedSpacing?: { line: number; label: number } | null;
  caps?: Partial<LgrsRenderCaps>;
};

/** `box`: constant-E/N lines per region. `zone`: only the zone/band framework. */
type LgrsRenderTier = "none" | "box" | "zone";

/** `seam` lines (zone meridians, ±80°, equator) are drawn with a heavier stroke. */
type LgrsRenderLineKind = "grid" | "seam";

/** Constant easting/northing (box tier) or constant longitude/latitude (framework). */
type LgrsRenderLineAxis = "easting" | "northing" | "meridian" | "parallel";

type LgrsRenderLine = {
  kind: LgrsRenderLineKind;
  axis: LgrsRenderLineAxis;
  /** Region CRS of an easting/northing line; −1 for meridians and parallels. */
  crs: LgrsCrsId;
  /** The constant E/N (metres) or lon/lat (degrees). */
  value: number;
  /** Flat map coordinates `[x0, y0, x1, y1, …]`. */
  coordinates: number[];
};

type LgrsRenderLabel = {
  crs: LgrsCrsId;
  /** Box-tier node (grid-southwest corner of the labelled box) in `crs`; null in the zone tier. */
  node: LgrsCoordinate | null;
  /** Map coordinate of the label anchor. */
  coordinate: [x: number, y: number];
  text: string;
  /** Box-tier label of the box at `node`; null in the zone tier. */
  label: LgrsLabel | null;
  /** Zone-tier labels sit at their cell centre; box-tier labels sit beside their node. */
  centered: boolean;
};

type LgrsRenderPlan = {
  tier: LgrsRenderTier;
  /** Line and label spacing of the view-centre region in LGRS metres (0 outside the box tier). */
  lineSpacing: number;
  labelSpacing: number;
  /** True when spacing (or zone-tier tolerance) was coarsened so the plan fits its caps. */
  capped: boolean;
  /** Regions that contributed box-tier lines or labels. */
  regions: LgrsCrsId[];
  lines: LgrsRenderLine[];
  labels: LgrsRenderLabel[];
  vertexCount: number;
};

/** Whether a mission can use the dynamic LGRS grid, with a reason the admin page can show. */
type LgrsCompatibility = {
  compatible: boolean;
  reason: string;
  /** The mission's map projection when it is compatible. */
  projection: LgrsMapProjection | null;
};

type LgrsViewSamples = {
  count: number;
  lat: Float64Array;
  lon: Float64Array;
  crs: Int32Array;
};

type LgrsViewEnvelope = {
  minLat: number;
  maxLat: number;
  /** `minLon` is in [-180, 180); `maxLon` may exceed 180 when the view crosses the antimeridian. */
  minLon: number;
  maxLon: number;
  fullLon: boolean;
};

type LgrsRegionView = {
  crs: LgrsCrsId;
  affine: LgrsMapAffine | null;
  /** E/N bounding box of the view in this crs (unpadded). */
  view: Float64Array;
  /** Box used to generate lines: the padded view box ∩ the region bounds. */
  lines: Float64Array;
};

type LgrsSpacingChoice = { line: number; label: number; hideLabels: boolean };

type LgrsPlanContext = {
  options: LgrsRenderOptions;
  adapter: LgrsMapAdapter;
  extent: LgrsMapExtent;
  resolution: number;
  caps: LgrsRenderCaps;
  envelope: LgrsViewEnvelope;
  centreX: number;
  centreY: number;
};

type LgrsBoxResult = {
  /** "lines" when the lines alone exceed the caps at this spacing. */
  status: "ok" | "lines";
  lines: LgrsRenderLine[];
  labels: LgrsRenderLabel[];
  /** Factor the label spacing was doubled to so the labels fit the cap. */
  labelScale: number;
  regions: LgrsCrsId[];
  vertexCount: number;
};

/** Curve point at parameter `t ∈ [0, 1]` in map coordinates; false when not finite. */
type LgrsCurveEvaluator = (t: number, out: Float64Array) => boolean;
