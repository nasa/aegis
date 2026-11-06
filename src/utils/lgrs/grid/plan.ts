import { LTM_LATITUDE_BAND_LETTERS, LTM_MAX_ABS_LATITUDE, LTM_ZONE_COUNT } from "../constants";
import {
  classifyLatLon,
  conformLongitude,
  getLtmCentralMeridian,
  getLtmCrsId,
  getLtmZone,
  isLpsCrs,
  isLtmCrs,
  LGRS_CRS_LPS_NORTH,
  LGRS_CRS_LPS_SOUTH,
} from "../crs";
import { formatLgrsLabel } from "../format";
import { projectLatLon, unprojectToLatLon } from "../projection";
import {
  clipGridLineToRegion,
  clipRunToExtent,
  densifyCurve,
  getLtmFalseNorthing,
  getRegionBounds,
} from "./clip";

/**
 * Whole-Moon dynamic LGRS render plan (plan §6.3). The view is sampled to find the visible LGRS
 * regions (LPS S/N and LTM zone × hemisphere cells). Zoomed in, each region gets constant-E/N
 * lines clipped to the region and labels at line intersections (box tier); zoomed far out only
 * the zone/band framework is drawn (zone tier). Plans never exceed their caps: the spacing is
 * coarsened instead.
 */

/** Finest auto spacing and the lattice the auto spacing is a multiple of. */
export const LGRS_GRID_BASE_SPACING_METERS = 10;
export const LGRS_RENDER_CAPS: LgrsRenderCaps = {
  maxVertices: 2000,
  maxLines: 600,
  maxLabels: 400,
};
/** Inherited minimap spacing doubles until adjacent lines are at least this far apart. */
export const MINIMAP_MIN_LINE_PX = 3;

const LINE_CELL_TARGET = 100;
const LABEL_TARGET = 25;
const LABEL_MIN_PX = 60;
const MAX_BOX_SPACING_METERS = 25000;
const MAX_BOX_REGIONS = 12;
const FALLBACK_SPACINGS = [10, 100, 1000, 25000];
const LABEL_PRECISIONS: readonly LgrsPrecision[] = [25000, 1000, 100, 10, 1];
const TOLERANCE_PX = 0.5;
const JUMP_PX = 64;
const MAX_DEPTH = 12;
const RING_STEPS = 16;
const LATTICE_STEPS = 8;
const BOX_PADDING = 0.02;
const MAX_LABEL_NODE_FACTOR = 8;
const MAX_LABEL_SCALE = 2 ** 20;
const ZONE_LABEL_MIN_PX = 48;
const ZONE_TOLERANCE_RETRIES = 3;
const BAND_DEGREES = 8;
const POLAR_LABEL_LATITUDE = 85;

/** Doubles `spacing` until adjacent lines are ≥ `MINIMAP_MIN_LINE_PX` apart at `unitsPerPixel`. */
export function coarsenForMinimap(spacing: number, unitsPerPixel: number): number {
  if (!(spacing > 0) || !(unitsPerPixel > 0) || !Number.isFinite(unitsPerPixel)) return spacing;
  const factor = (MINIMAP_MIN_LINE_PX * unitsPerPixel) / spacing;
  return factor <= 1 ? spacing : spacing * 2 ** Math.ceil(Math.log2(factor));
}

const scratch = new Float64Array(2);
const scratchLatLon = new Float64Array(2);
const intervals = new Float64Array(4);
const regionBounds = new Float64Array(4);

function emptyPlan(): LgrsRenderPlan {
  return {
    tier: "none",
    lineSpacing: 0,
    labelSpacing: 0,
    capped: false,
    regions: [],
    lines: [],
    labels: [],
    vertexCount: 0,
  };
}

function alignFirst(value: number, spacing: number): number {
  return Math.ceil(value / spacing) * spacing;
}

function getLabelPrecision(spacing: number): LgrsPrecision {
  return LABEL_PRECISIONS.find((precision) => spacing % precision === 0) ?? 1;
}

function isInExtent(x: number, y: number, extent: LgrsMapExtent): boolean {
  return x >= extent[0] && x <= extent[2] && y >= extent[1] && y <= extent[3];
}

// * VIEW SAMPLING ────────────────────────────────────────────────────

function sampleView(adapter: LgrsMapAdapter, extent: LgrsMapExtent): LgrsViewSamples {
  const total = RING_STEPS * 4 + (LATTICE_STEPS - 1) ** 2;
  const samples: LgrsViewSamples = {
    count: 0,
    lat: new Float64Array(total),
    lon: new Float64Array(total),
    crs: new Int32Array(total),
  };
  const add = (x: number, y: number) => {
    if (!adapter.mapToLatLon(x, y, scratch)) return;
    const crs = classifyLatLon(scratch[0], scratch[1]);
    if (crs < 0) return;
    samples.lat[samples.count] = scratch[0];
    samples.lon[samples.count] = conformLongitude(scratch[1]);
    samples.crs[samples.count] = crs;
    samples.count++;
  };
  const [minX, minY, maxX, maxY] = extent;
  const width = maxX - minX;
  const height = maxY - minY;
  for (let step = 0; step < RING_STEPS; step++) {
    const f = step / RING_STEPS;
    add(minX + f * width, minY);
    add(maxX, minY + f * height);
    add(maxX - f * width, maxY);
    add(minX, maxY - f * height);
  }
  for (let i = 1; i < LATTICE_STEPS; i++) {
    for (let j = 1; j < LATTICE_STEPS; j++) {
      add(minX + (i / LATTICE_STEPS) * width, minY + (j / LATTICE_STEPS) * height);
    }
  }
  return samples;
}

/** 0 when the pole is not shown, 1 when part of it is, 2 when all its longitudes meet in view. */
function getPoleVisibility(adapter: LgrsMapAdapter, extent: LgrsMapExtent, lat: number): number {
  let inside = 0;
  for (const lon of [-180, -90, 0, 90]) {
    if (adapter.latLonToMap(lat, lon, scratch) && isInExtent(scratch[0], scratch[1], extent)) {
      inside++;
    }
  }
  return inside === 4 ? 2 : inside > 0 ? 1 : 0;
}

function computeEnvelope(
  samples: LgrsViewSamples,
  adapter: LgrsMapAdapter,
  extent: LgrsMapExtent
): LgrsViewEnvelope {
  let minLat = Infinity;
  let maxLat = -Infinity;
  const lons: number[] = [];
  for (let index = 0; index < samples.count; index++) {
    minLat = Math.min(minLat, samples.lat[index]);
    maxLat = Math.max(maxLat, samples.lat[index]);
    lons.push(samples.lon[index]);
  }
  const latPad = Math.max(1e-9, (maxLat - minLat) / RING_STEPS);
  minLat = Math.max(-90, minLat - latPad);
  maxLat = Math.min(90, maxLat + latPad);

  // The visible longitudes are the complement of the largest gap between samples.
  lons.sort((a, b) => a - b);
  let gap = lons[0] + 360 - lons[lons.length - 1];
  let minLon = lons[0];
  let maxLon = lons[lons.length - 1];
  for (let index = 0; index + 1 < lons.length; index++) {
    const candidate = lons[index + 1] - lons[index];
    if (candidate > gap) {
      gap = candidate;
      minLon = lons[index + 1];
      maxLon = lons[index] + 360;
    }
  }
  const lonPad = Math.max(1e-9, (maxLon - minLon) / RING_STEPS);
  minLon -= lonPad;
  maxLon += lonPad;
  let fullLon = maxLon - minLon >= 360;

  const south = getPoleVisibility(adapter, extent, -90);
  const north = getPoleVisibility(adapter, extent, 90);
  if (south > 0) minLat = -90;
  if (north > 0) maxLat = 90;
  if (south === 2 || north === 2) fullLon = true;

  if (fullLon) return { minLat, maxLat, minLon: -180, maxLon: 180, fullLon };
  if (minLon < -180) {
    minLon += 360;
    maxLon += 360;
  }
  return { minLat, maxLat, minLon, maxLon, fullLon };
}

/** Values `origin + k·step` inside the envelope's longitudes (unwrapped to the envelope). */
function getEnvelopeLongitudes(envelope: LgrsViewEnvelope, step: number, origin: number): number[] {
  const values: number[] = [];
  if (envelope.fullLon) {
    for (let value = origin; value < origin + 360; value += step) values.push(value);
    return values;
  }
  const first = Math.ceil((envelope.minLon - origin) / step);
  const last = Math.floor((envelope.maxLon - origin) / step);
  for (let k = first; k <= last; k++) values.push(origin + k * step);
  return values;
}

/** LTM zones overlapping the envelope's longitudes. */
function getEnvelopeZones(envelope: LgrsViewEnvelope): number[] {
  if (envelope.fullLon) return Array.from({ length: LTM_ZONE_COUNT }, (_, index) => index + 1);
  const first = Math.floor((envelope.minLon + 180) / 8);
  const last = Math.floor((envelope.maxLon + 180) / 8 - 1e-12);
  const zones: number[] = [];
  for (let k = first; k <= Math.min(last, first + LTM_ZONE_COUNT - 1); k++) {
    zones.push((((k % LTM_ZONE_COUNT) + LTM_ZONE_COUNT) % LTM_ZONE_COUNT) + 1);
  }
  return zones;
}

function getCandidateRegions(envelope: LgrsViewEnvelope): LgrsCrsId[] {
  const regions: LgrsCrsId[] = [];
  const { minLat, maxLat } = envelope;
  if (minLat <= -LTM_MAX_ABS_LATITUDE) regions.push(LGRS_CRS_LPS_SOUTH);
  if (maxLat >= LTM_MAX_ABS_LATITUDE) regions.push(LGRS_CRS_LPS_NORTH);
  const north = maxLat >= 0 && minLat < LTM_MAX_ABS_LATITUDE;
  const south = minLat < 0 && maxLat > -LTM_MAX_ABS_LATITUDE;
  for (const zone of getEnvelopeZones(envelope)) {
    if (north) regions.push(getLtmCrsId(zone, "N"));
    if (south) regions.push(getLtmCrsId(zone, "S"));
  }
  return regions;
}

// * REGION GEOMETRY ──────────────────────────────────────────────────

function getRegionView(
  ctx: LgrsPlanContext,
  samples: LgrsViewSamples,
  crs: LgrsCrsId
): LgrsRegionView | null {
  const affine = ctx.adapter.getAffine(crs);
  const view = new Float64Array(4);
  if (affine) {
    const [minX, minY, maxX, maxY] = ctx.extent;
    const e0 = minX * affine.scale + affine.offsetE;
    const e1 = maxX * affine.scale + affine.offsetE;
    const n0 = minY * affine.scale + affine.offsetN;
    const n1 = maxY * affine.scale + affine.offsetN;
    view[0] = Math.min(e0, e1);
    view[1] = Math.min(n0, n1);
    view[2] = Math.max(e0, e1);
    view[3] = Math.max(n0, n1);
  } else {
    view[0] = view[1] = Infinity;
    view[2] = view[3] = -Infinity;
    for (let index = 0; index < samples.count; index++) {
      if (!projectLatLon(samples.lat[index], samples.lon[index], crs, scratch)) continue;
      view[0] = Math.min(view[0], scratch[0]);
      view[1] = Math.min(view[1], scratch[1]);
      view[2] = Math.max(view[2], scratch[0]);
      view[3] = Math.max(view[3], scratch[1]);
    }
    if (!(view[0] <= view[2] && view[1] <= view[3])) return null;
  }

  // Non-affine views are bounded by samples; the padding covers the boundary between them, and
  // the map-space clip trims what the padding adds.
  const pad = affine ? 0 : BOX_PADDING * Math.max(view[2] - view[0], view[3] - view[1]);
  getRegionBounds(crs, regionBounds);
  const lines = new Float64Array([
    Math.max(view[0] - pad, regionBounds[0]),
    Math.max(view[1] - pad, regionBounds[1]),
    Math.min(view[2] + pad, regionBounds[2]),
    Math.min(view[3] + pad, regionBounds[3]),
  ]);
  if (!(lines[0] <= lines[2] && lines[1] <= lines[3])) return null;
  return { crs, affine, view, lines };
}

/** Base-lattice cells of the region's visible part (today's density heuristic input). */
function getVisibleBaseCellCount(region: LgrsRegionView): number {
  let [minE, minN, maxE, maxN] = region.view;
  if (isLpsCrs(region.crs)) {
    getRegionBounds(region.crs, regionBounds);
    minE = Math.max(minE, regionBounds[0]);
    minN = Math.max(minN, regionBounds[1]);
    maxE = Math.min(maxE, regionBounds[2]);
    maxN = Math.min(maxN, regionBounds[3]);
  }
  const columns = Math.max(1, Math.ceil(Math.max(0, maxE - minE) / LGRS_GRID_BASE_SPACING_METERS));
  const rows = Math.max(1, Math.ceil(Math.max(0, maxN - minN) / LGRS_GRID_BASE_SPACING_METERS));
  return columns * rows;
}

/** LGRS metres per screen pixel of `crs` at the view centre. */
function getMetersPerPixel(ctx: LgrsPlanContext, region: LgrsRegionView): number {
  if (region.affine) return ctx.resolution * Math.abs(region.affine.scale);
  const { adapter, centreX, centreY, resolution } = ctx;
  if (!adapter.mapToLgrs(centreX, centreY, region.crs, scratch)) return NaN;
  const e = scratch[0];
  const n = scratch[1];
  if (!adapter.mapToLgrs(centreX + resolution, centreY, region.crs, scratch)) return NaN;
  const dx = Math.hypot(scratch[0] - e, scratch[1] - n);
  if (!adapter.mapToLgrs(centreX, centreY + resolution, region.crs, scratch)) return NaN;
  const dy = Math.hypot(scratch[0] - e, scratch[1] - n);
  return Math.sqrt(dx * dy);
}

/** Project into the horizontal world containing the view centre before clipping. */
function latLonToView(ctx: LgrsPlanContext, lat: number, lon: number, out: Float64Array): boolean {
  if (!ctx.adapter.latLonToMap(lat, lon, out)) return false;
  const width = ctx.adapter.worldWidth;
  if (width !== null) out[0] += Math.round((ctx.centreX - out[0]) / width) * width;
  return true;
}

/** Region E/N → map, keeping LTM longitudes continuous across the zone (e.g. zone 45 at 180°). */
function regionToMap(
  ctx: LgrsPlanContext,
  region: LgrsRegionView,
  e: number,
  n: number,
  out: Float64Array
): boolean {
  if (region.affine) return ctx.adapter.lgrsToMap(e, n, region.crs, out);
  if (!unprojectToLatLon(e, n, region.crs, scratchLatLon)) return false;
  let lon = scratchLatLon[1];
  if (isLtmCrs(region.crs)) {
    const centralMeridian = getLtmCentralMeridian(getLtmZone(region.crs));
    let offset = lon - centralMeridian;
    if (offset < -180) offset += 360;
    else if (offset >= 180) offset -= 360;
    lon = centralMeridian + offset;
  }
  return latLonToView(ctx, scratchLatLon[0], lon, out);
}

// * SPACING ──────────────────────────────────────────────────────────

/** Today's density heuristic (≈100 line cells, ≈25 labels on the 10 m lattice). */
function chooseSpacing(
  options: LgrsRenderOptions,
  cells: number,
  metersPerPixel: number,
  lineOverride: number | null
): LgrsSpacingChoice {
  let spacingMode = options.gridSpacingMode;
  let labelInterval = options.gridLabelInterval;
  const inherited = options.inheritedSpacing;
  if (inherited && inherited.line > 0) {
    spacingMode = coarsenForMinimap(inherited.line, metersPerPixel);
    labelInterval = Math.max(spacingMode, inherited.label);
  }
  const line =
    lineOverride ??
    (spacingMode === "auto"
      ? Math.max(
          LGRS_GRID_BASE_SPACING_METERS,
          Math.ceil(Math.sqrt(cells / LINE_CELL_TARGET)) * LGRS_GRID_BASE_SPACING_METERS
        )
      : spacingMode);

  let label = line;
  let hideLabels = !options.labelsVisible;
  if (spacingMode === "auto") {
    const target = Math.ceil(Math.sqrt(cells / LABEL_TARGET)) * LGRS_GRID_BASE_SPACING_METERS;
    label = Math.ceil(target / line) * line;
  } else if (labelInterval === "auto") {
    const pixelSpacing = line / metersPerPixel;
    hideLabels = hideLabels || !Number.isFinite(pixelSpacing) || pixelSpacing < LABEL_MIN_PX;
  } else {
    label = Math.max(line, Math.ceil(labelInterval / line) * line);
  }
  return { line, label, hideLabels };
}

// * LINES ────────────────────────────────────────────────────────────

/** Densifies, view-clips and appends one curve; returns the vertices added. */
function emitCurve(
  ctx: LgrsPlanContext,
  evaluate: (t: number, out: Float64Array) => boolean,
  tolerance: number,
  template: Omit<LgrsRenderLine, "coordinates">,
  out: LgrsRenderLine[]
): number {
  const runs: number[][] = [];
  densifyCurve(evaluate, tolerance, MAX_DEPTH, (JUMP_PX / TOLERANCE_PX) * tolerance, runs);
  let vertices = 0;
  for (const run of runs) {
    const clipped: number[][] = [];
    clipRunToExtent(run, ctx.extent, clipped);
    for (const coordinates of clipped) {
      out.push({ ...template, coordinates });
      vertices += coordinates.length / 2;
    }
  }
  return vertices;
}

function emitGridLine(
  ctx: LgrsPlanContext,
  region: LgrsRegionView,
  axis: "easting" | "northing",
  value: number,
  from: number,
  to: number,
  out: LgrsRenderLine[]
): number {
  const easting = axis === "easting";
  const template = { kind: "grid" as const, axis, crs: region.crs, value };
  if (region.affine) {
    const coordinates = [0, 0, 0, 0];
    ctx.adapter.lgrsToMap(easting ? value : from, easting ? from : value, region.crs, scratch);
    coordinates[0] = scratch[0];
    coordinates[1] = scratch[1];
    ctx.adapter.lgrsToMap(easting ? value : to, easting ? to : value, region.crs, scratch);
    coordinates[2] = scratch[0];
    coordinates[3] = scratch[1];
    out.push({ ...template, coordinates });
    return 2;
  }
  const length = to - from;
  return emitCurve(
    ctx,
    (t, point) => {
      const along = from + t * length;
      return regionToMap(ctx, region, easting ? value : along, easting ? along : value, point);
    },
    TOLERANCE_PX * ctx.resolution,
    template,
    out
  );
}

/** Lines of one region; returns the vertices added, or -1 when a cap is exceeded. */
function emitRegionLines(
  ctx: LgrsPlanContext,
  region: LgrsRegionView,
  spacing: number,
  out: LgrsRenderLine[],
  vertexBudget: number
): number {
  const [minE, minN, maxE, maxN] = region.lines;
  const lineCount =
    Math.floor(maxE / spacing) -
    Math.ceil(minE / spacing) +
    1 +
    (Math.floor(maxN / spacing) - Math.ceil(minN / spacing) + 1);
  if (out.length + lineCount > ctx.caps.maxLines) return -1;

  // The equator is a seam; LTM lines along it are drawn as the framework line.
  const equatorNorthing = isLtmCrs(region.crs) ? getLtmFalseNorthing(region.crs) : NaN;
  let vertices = 0;
  for (let easting = alignFirst(minE, spacing); easting <= maxE; easting += spacing) {
    const count = clipGridLineToRegion(region.crs, "easting", easting, intervals);
    for (let part = 0; part < count; part++) {
      const from = Math.max(minN, intervals[part * 2]);
      const to = Math.min(maxN, intervals[part * 2 + 1]);
      if (from <= to) vertices += emitGridLine(ctx, region, "easting", easting, from, to, out);
    }
    if (vertices > vertexBudget || out.length > ctx.caps.maxLines) return -1;
  }
  for (let northing = alignFirst(minN, spacing); northing <= maxN; northing += spacing) {
    if (northing === equatorNorthing) continue;
    const count = clipGridLineToRegion(region.crs, "northing", northing, intervals);
    for (let part = 0; part < count; part++) {
      const from = Math.max(minE, intervals[part * 2]);
      const to = Math.min(maxE, intervals[part * 2 + 1]);
      if (from <= to) vertices += emitGridLine(ctx, region, "northing", northing, from, to, out);
    }
    if (vertices > vertexBudget || out.length > ctx.caps.maxLines) return -1;
  }
  return vertices;
}

function emitMeridian(
  ctx: LgrsPlanContext,
  lon: number,
  minLat: number,
  maxLat: number,
  kind: LgrsRenderLineKind,
  tolerance: number,
  out: LgrsRenderLine[]
): number {
  if (!(minLat < maxLat)) return 0;
  const span = maxLat - minLat;
  return emitCurve(
    ctx,
    (t, point) => latLonToView(ctx, minLat + t * span, lon, point),
    tolerance,
    { kind, axis: "meridian", crs: -1, value: conformLongitude(lon) },
    out
  );
}

function emitParallel(
  ctx: LgrsPlanContext,
  lat: number,
  kind: LgrsRenderLineKind,
  tolerance: number,
  out: LgrsRenderLine[]
): number {
  const { minLat, maxLat, minLon, maxLon } = ctx.envelope;
  if (lat < minLat || lat > maxLat) return 0;
  const span = maxLon - minLon;
  return emitCurve(
    ctx,
    (t, point) => latLonToView(ctx, lat, minLon + t * span, point),
    tolerance,
    { kind, axis: "parallel", crs: -1, value: lat },
    out
  );
}

/**
 * Framework lines: zone meridians, ±80° and the equator as seams; in the zone tier also the
 * 8° band parallels and the LPS A/B (Y/Z) split meridians.
 */
function emitFramework(
  ctx: LgrsPlanContext,
  includeBands: boolean,
  tolerance: number,
  out: LgrsRenderLine[]
): number {
  const { minLat, maxLat } = ctx.envelope;
  let vertices = 0;
  const ltmMinLat = Math.max(minLat, -LTM_MAX_ABS_LATITUDE);
  const ltmMaxLat = Math.min(maxLat, LTM_MAX_ABS_LATITUDE);
  for (const lon of getEnvelopeLongitudes(ctx.envelope, BAND_DEGREES, -180)) {
    vertices += emitMeridian(ctx, lon, ltmMinLat, ltmMaxLat, "seam", tolerance, out);
  }
  for (const lat of [-LTM_MAX_ABS_LATITUDE, 0, LTM_MAX_ABS_LATITUDE]) {
    vertices += emitParallel(ctx, lat, "seam", tolerance, out);
  }
  if (!includeBands) return vertices;
  for (let lat = -LTM_MAX_ABS_LATITUDE + BAND_DEGREES; lat < LTM_MAX_ABS_LATITUDE; lat += 8) {
    if (lat !== 0) vertices += emitParallel(ctx, lat, "grid", tolerance, out);
  }
  for (const lon of getEnvelopeLongitudes(ctx.envelope, 180, 0)) {
    vertices += emitMeridian(
      ctx,
      lon,
      Math.max(minLat, -90),
      Math.min(maxLat, -LTM_MAX_ABS_LATITUDE),
      "grid",
      tolerance,
      out
    );
    vertices += emitMeridian(
      ctx,
      lon,
      Math.max(minLat, LTM_MAX_ABS_LATITUDE),
      Math.min(maxLat, 90),
      "grid",
      tolerance,
      out
    );
  }
  return vertices;
}

// * LABELS ───────────────────────────────────────────────────────────

/** Labels of one region; returns false when the label cap is exceeded. */
function emitRegionLabels(
  ctx: LgrsPlanContext,
  region: LgrsRegionView,
  spacing: number,
  out: LgrsRenderLabel[]
): boolean {
  const [minE, minN, maxE, maxN] = region.affine ? region.view : region.lines;
  const nodeCount =
    Math.max(0, Math.floor(maxE / spacing) - Math.ceil(minE / spacing) + 1) *
    Math.max(0, Math.floor(maxN / spacing) - Math.ceil(minN / spacing) + 1);
  if (nodeCount > ctx.caps.maxLabels * MAX_LABEL_NODE_FACTOR) return false;

  const precision = getLabelPrecision(spacing);
  for (let northing = alignFirst(minN, spacing); northing <= maxN; northing += spacing) {
    for (let easting = alignFirst(minE, spacing); easting <= maxE; easting += spacing) {
      const label = formatLgrsLabel(easting, northing, region.crs, precision);
      if (!label) continue;
      if (!regionToMap(ctx, region, easting, northing, scratch)) continue;
      if (!region.affine && !isInExtent(scratch[0], scratch[1], ctx.extent)) continue;
      out.push({
        crs: region.crs,
        node: [easting, northing],
        coordinate: [scratch[0], scratch[1]],
        text: label.text,
        label,
        centered: false,
      });
      if (out.length > ctx.caps.maxLabels) return false;
    }
  }
  return true;
}

/** Accepts a zone-tier label unless one is already within `ZONE_LABEL_MIN_PX`. */
function createLabelDeclutter(ctx: LgrsPlanContext) {
  const cells = new Map<string, [number, number][]>();
  return (x: number, y: number): boolean => {
    const px = (x - ctx.extent[0]) / ctx.resolution;
    const py = (y - ctx.extent[1]) / ctx.resolution;
    const cx = Math.floor(px / ZONE_LABEL_MIN_PX);
    const cy = Math.floor(py / ZONE_LABEL_MIN_PX);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cy - 1; j <= cy + 1; j++) {
        for (const [ox, oy] of cells.get(`${i},${j}`) ?? []) {
          if (Math.hypot(ox - px, oy - py) < ZONE_LABEL_MIN_PX) return false;
        }
      }
    }
    const key = `${cx},${cy}`;
    const list = cells.get(key);
    if (list) list.push([px, py]);
    else cells.set(key, [[px, py]]);
    return true;
  };
}

function emitZoneLabels(ctx: LgrsPlanContext, out: LgrsRenderLabel[]): void {
  const accept = createLabelDeclutter(ctx);
  const { minLat, maxLat } = ctx.envelope;
  const tryLabel = (lat: number, lon: number, crs: LgrsCrsId, text: string) => {
    if (out.length >= ctx.caps.maxLabels || lat < minLat || lat > maxLat) return;
    if (!latLonToView(ctx, lat, lon, scratch)) return;
    if (!isInExtent(scratch[0], scratch[1], ctx.extent) || !accept(scratch[0], scratch[1])) return;
    out.push({
      crs,
      node: null,
      coordinate: [scratch[0], scratch[1]],
      text,
      label: null,
      centered: true,
    });
  };

  tryLabel(-POLAR_LABEL_LATITUDE, -90, LGRS_CRS_LPS_SOUTH, "A");
  tryLabel(-POLAR_LABEL_LATITUDE, 90, LGRS_CRS_LPS_SOUTH, "B");
  tryLabel(POLAR_LABEL_LATITUDE, -90, LGRS_CRS_LPS_NORTH, "Y");
  tryLabel(POLAR_LABEL_LATITUDE, 90, LGRS_CRS_LPS_NORTH, "Z");
  const centralMeridians = getEnvelopeLongitudes(ctx.envelope, BAND_DEGREES, -176);
  for (const lon of centralMeridians) {
    const zone = Math.round((conformLongitude(lon) + 176) / BAND_DEGREES) + 1;
    for (let lat = -LTM_MAX_ABS_LATITUDE + 4; lat < LTM_MAX_ABS_LATITUDE; lat += BAND_DEGREES) {
      const band = LTM_LATITUDE_BAND_LETTERS[Math.floor(lat / BAND_DEGREES) + 11];
      tryLabel(lat, lon, getLtmCrsId(zone, lat < 0 ? "S" : "N"), `${zone}${band}`);
    }
  }
}

// * TIERS ────────────────────────────────────────────────────────────

function buildZonePlan(ctx: LgrsPlanContext): LgrsRenderPlan {
  let tolerance = TOLERANCE_PX * ctx.resolution;
  let lines: LgrsRenderLine[] = [];
  let vertexCount = 0;
  let capped = false;
  for (let attempt = 0; attempt <= ZONE_TOLERANCE_RETRIES; attempt++) {
    lines = [];
    vertexCount = emitFramework(ctx, true, tolerance, lines);
    if (vertexCount <= ctx.caps.maxVertices && lines.length <= ctx.caps.maxLines) break;
    capped = true;
    tolerance *= 4;
  }
  if (vertexCount > ctx.caps.maxVertices || lines.length > ctx.caps.maxLines) {
    lines = [];
    vertexCount = 0;
  }
  const labels: LgrsRenderLabel[] = [];
  if (ctx.options.labelsVisible) emitZoneLabels(ctx, labels);
  return {
    tier: "zone",
    lineSpacing: 0,
    labelSpacing: 0,
    capped,
    regions: [],
    lines,
    labels,
    vertexCount,
  };
}

function buildBox(
  ctx: LgrsPlanContext,
  regions: LgrsRegionView[],
  spacings: LgrsSpacingChoice[]
): LgrsBoxResult {
  const lines: LgrsRenderLine[] = [];
  let labels: LgrsRenderLabel[] = [];
  const lineRegions = new Set<LgrsCrsId>();
  let vertexCount = 0;
  const failed = (): LgrsBoxResult => ({
    status: "lines",
    lines,
    labels,
    labelScale: 1,
    regions: [],
    vertexCount,
  });

  for (let index = 0; index < regions.length; index++) {
    const before = lines.length;
    const added = emitRegionLines(
      ctx,
      regions[index],
      spacings[index].line,
      lines,
      ctx.caps.maxVertices - vertexCount
    );
    if (added < 0) return failed();
    vertexCount += added;
    if (lines.length > before) lineRegions.add(regions[index].crs);
  }
  vertexCount += emitFramework(ctx, false, TOLERANCE_PX * ctx.resolution, lines);
  if (vertexCount > ctx.caps.maxVertices || lines.length > ctx.caps.maxLines) return failed();

  // Labels over the cap double their spacing; the lines are kept.
  let labelScale = 1;
  let used = lineRegions;
  for (; labelScale <= MAX_LABEL_SCALE; labelScale *= 2) {
    labels = [];
    used = new Set(lineRegions);
    let fits = true;
    for (let index = 0; index < regions.length && fits; index++) {
      if (spacings[index].hideLabels) continue;
      const before = labels.length;
      const spacing = spacings[index].label * labelScale;
      fits = emitRegionLabels(ctx, regions[index], spacing, labels);
      if (labels.length > before) used.add(regions[index].crs);
    }
    if (fits) break;
  }
  if (labelScale > MAX_LABEL_SCALE) labels = [];
  return { status: "ok", lines, labels, labelScale, regions: [...used], vertexCount };
}

/** Builds the dynamic LGRS grid for the map view (plan §6.3). */
export function createLgrsRenderPlan(options: LgrsRenderOptions): LgrsRenderPlan {
  const { adapter, extent, resolution } = options;
  if (
    !extent.every(Number.isFinite) ||
    !(extent[2] > extent[0] && extent[3] > extent[1]) ||
    !(resolution > 0)
  ) {
    return emptyPlan();
  }
  const samples = sampleView(adapter, extent);
  if (samples.count === 0) return emptyPlan();

  const ctx: LgrsPlanContext = {
    options,
    adapter,
    extent,
    resolution,
    caps: { ...LGRS_RENDER_CAPS, ...options.caps },
    envelope: computeEnvelope(samples, adapter, extent),
    centreX: (extent[0] + extent[2]) / 2,
    centreY: (extent[1] + extent[3]) / 2,
  };

  const seen = new Set<number>();
  for (let index = 0; index < samples.count; index++) seen.add(samples.crs[index]);
  if (seen.size > MAX_BOX_REGIONS) return buildZonePlan(ctx);

  let centreCrs = -1;
  if (adapter.mapToLatLon(ctx.centreX, ctx.centreY, scratch)) {
    centreCrs = classifyLatLon(scratch[0], scratch[1]);
  }
  if (centreCrs < 0) centreCrs = samples.crs[samples.count - 1];

  const regions: LgrsRegionView[] = [];
  for (const crs of getCandidateRegions(ctx.envelope)) {
    const region = getRegionView(ctx, samples, crs);
    if (region) regions.push(region);
  }
  const centre = regions.find((region) => region.crs === centreCrs);
  if (!centre) return buildZonePlan(ctx);
  // The centre region sets the density for every region so it stays uniform across seams.
  const cells = getVisibleBaseCellCount(centre);
  const centreMpp = getMetersPerPixel(ctx, centre);
  const regionMpp = options.inheritedSpacing
    ? regions.map((region) => getMetersPerPixel(ctx, region))
    : null;

  let lineOverride: number | null = null;
  for (;;) {
    const override = lineOverride;
    const centreChoice = chooseSpacing(options, cells, centreMpp, override);
    if (centreChoice.line > MAX_BOX_SPACING_METERS) {
      const zone = buildZonePlan(ctx);
      return { ...zone, capped: zone.capped || override !== null };
    }
    const spacings = regions.map((region, index) =>
      regionMpp ? chooseSpacing(options, cells, regionMpp[index], override) : centreChoice
    );
    const result = buildBox(ctx, regions, spacings);
    if (result.status === "ok") {
      return {
        tier: "box",
        lineSpacing: centreChoice.line,
        labelSpacing: centreChoice.label * result.labelScale,
        capped: override !== null || result.labelScale > 1,
        regions: result.regions,
        lines: result.lines,
        labels: result.labels,
        vertexCount: result.vertexCount,
      };
    }
    const coarsest = Math.max(...spacings.map((spacing) => spacing.line));
    lineOverride = FALLBACK_SPACINGS.find((spacing) => spacing > coarsest) ?? Infinity;
  }
}
