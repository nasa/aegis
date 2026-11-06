import {
  UPS_FALSE_EASTING,
  UPS_FALSE_NORTHING,
  UTM_FALSE_EASTING,
  UTM_FALSE_NORTHING_NORTH,
  UTM_FALSE_NORTHING_SOUTH,
  UTM_MAX_LATITUDE,
  UTM_MIN_LATITUDE,
  UTM_ZONE_COUNT,
} from "./constants";
import { projectEarthLatLon, unprojectEarthToLatLon } from "./projection";
import {
  EARTH_CRS_UPS_NORTH,
  EARTH_CRS_UPS_SOUTH,
  getEarthRegionSlices,
  getUtmCentralMeridian,
  getUtmCrsId,
  getUtmZone,
  isSouthEarthCrs,
  isUtmCrs,
  isValidEarthCrs,
} from "./zones";

/**
 * Earth region geometry for the dynamic grid: UPS caps, UTM zone bounds, grid-line
 * clipping and the zone/band framework. Every region test goes through the region slices of
 * `earth/zones`, whose union is exactly what `classifyEarthLatLon` assigns to a CRS, so the
 * renderer and the readouts agree, including at the Norway and Svalbard exceptions.
 */

const CRS_COUNT = 2 + UTM_ZONE_COUNT * 2;
/** Bounds padding (m); the bounds are sampled at their extremes, so this only absorbs rounding. */
const BOUNDS_PADDING_METERS = 1;
const BOUNDS_EDGE_SAMPLES = 8;
/** Root-finding stops once the bracket is this narrow (m). */
const CROSSING_TOLERANCE_METERS = 1e-4;
const CROSSING_MAX_ITERATIONS = 64;

const scratch = new Float64Array(2);

// * CAPS ──────────────────────────────────────────────────────────────

function createCap(crs: LgrsCrsId, limitLatitude: number): LgrsCap {
  projectEarthLatLon(limitLatitude, 0, crs, scratch);
  return Object.freeze({
    centreE: UPS_FALSE_EASTING,
    centreN: UPS_FALSE_NORTHING,
    radius: Math.hypot(scratch[0] - UPS_FALSE_EASTING, scratch[1] - UPS_FALSE_NORTHING),
  });
}

let caps: [south: LgrsCap, north: LgrsCap] | null = null;

/** The UPS cap of `crs` (radius: the ellipsoidal distance to 80° S or 84° N), or null for UTM. */
export function getEarthCap(crs: LgrsCrsId): LgrsCap | null {
  if (crs !== EARTH_CRS_UPS_SOUTH && crs !== EARTH_CRS_UPS_NORTH) return null;
  caps ??= [
    createCap(EARTH_CRS_UPS_SOUTH, UTM_MIN_LATITUDE),
    createCap(EARTH_CRS_UPS_NORTH, UTM_MAX_LATITUDE),
  ];
  return caps[crs];
}

// * UTM REGIONS ───────────────────────────────────────────────────────

export function getUtmFalseNorthing(crs: LgrsCrsId): number {
  return isSouthEarthCrs(crs) ? UTM_FALSE_NORTHING_SOUTH : UTM_FALSE_NORTHING_NORTH;
}

const regionBounds: (Float64Array | undefined)[] = [];

function extendBounds(crs: LgrsCrsId, lat: number, lon: number, bounds: Float64Array): void {
  if (!projectEarthLatLon(lat, lon, crs, scratch)) return;
  bounds[0] = Math.min(bounds[0], scratch[0]);
  bounds[1] = Math.min(bounds[1], scratch[1]);
  bounds[2] = Math.max(bounds[2], scratch[0]);
  bounds[3] = Math.max(bounds[3], scratch[1]);
}

/**
 * E/N bounds of a UTM region from its slice outlines. E and N are monotone along each slice edge
 * except N along a parallel, which turns at the central meridian, so the corners and the
 * central-meridian points hold the extremes; the edge samples and padding are a safety margin.
 */
function computeRegionBounds(crs: LgrsCrsId): Float64Array {
  const bounds = new Float64Array([Infinity, Infinity, -Infinity, -Infinity]);
  const centralMeridian = getUtmCentralMeridian(getUtmZone(crs));
  for (const { south, north, west, east } of getEarthRegionSlices(crs)) {
    for (let step = 0; step <= BOUNDS_EDGE_SAMPLES; step++) {
      const f = step / BOUNDS_EDGE_SAMPLES;
      const lat = south + f * (north - south);
      const lon = west + f * (east - west);
      extendBounds(crs, south, lon, bounds);
      extendBounds(crs, north, lon, bounds);
      extendBounds(crs, lat, west, bounds);
      extendBounds(crs, lat, east, bounds);
    }
    if (centralMeridian >= west && centralMeridian <= east) {
      extendBounds(crs, south, centralMeridian, bounds);
      extendBounds(crs, north, centralMeridian, bounds);
    }
  }
  bounds[0] -= BOUNDS_PADDING_METERS;
  bounds[1] -= BOUNDS_PADDING_METERS;
  bounds[2] += BOUNDS_PADDING_METERS;
  bounds[3] += BOUNDS_PADDING_METERS;
  // Nothing in a hemisphere region lies across its false northing.
  if (isSouthEarthCrs(crs)) bounds[3] = UTM_FALSE_NORTHING_SOUTH;
  else bounds[1] = UTM_FALSE_NORTHING_NORTH;
  return bounds;
}

/** Conservative E/N bounding box of a UTM region, written to `out` as `[minE, minN, maxE, maxN]`. */
export function getEarthRegionBounds(crs: LgrsCrsId, out: Float64Array): void {
  if (!isUtmCrs(crs)) {
    out.fill(NaN, 0, 4);
    return;
  }
  const bounds = (regionBounds[crs] ??= computeRegionBounds(crs));
  out[0] = bounds[0];
  out[1] = bounds[1];
  out[2] = bounds[2];
  out[3] = bounds[3];
}

// * GRID-LINE CLIPPING ────────────────────────────────────────────────

// The line being clipped, and its last evaluated point.
let lineCrs: LgrsCrsId = -1;
let lineEasting = true;
let lineValue = 0;
let lineCentralMeridian = 0;
let lineLat = 0;
let lineLon = 0;

/**
 * Unprojects point `t` of the line into `lineLat` and `lineLon` (longitude relative to the
 * central meridian, in [-180, 180)). False when the inverse fails.
 */
function evaluateLine(t: number): boolean {
  const e = lineEasting ? lineValue : t;
  const n = lineEasting ? t : lineValue;
  if (!unprojectEarthToLatLon(e, n, lineCrs, scratch)) return false;
  lineLat = scratch[0];
  let offset = scratch[1] - lineCentralMeridian;
  if (offset < -180) offset += 360;
  else if (offset >= 180) offset -= 360;
  lineLon = offset;
  return true;
}

/** The latitude (`latitude` true) or relative longitude of the line at `t` minus `threshold`. */
function lineOffset(t: number, latitude: boolean, threshold: number): number {
  if (!evaluateLine(t)) return NaN;
  return (latitude ? lineLat : lineLon) - threshold;
}

/**
 * Where `lineOffset` changes sign in `[a, b]`, given its values `fa` and `fb` there, by the
 * Illinois variant of regula falsi with a bisection step whenever the bracket stalls.
 */
function findCrossing(
  a: number,
  fa: number,
  b: number,
  fb: number,
  latitude: boolean,
  threshold: number
): number {
  let side = 0;
  let previousWidth = b - a;
  for (let iteration = 0; iteration < CROSSING_MAX_ITERATIONS; iteration++) {
    const width = b - a;
    if (width <= CROSSING_TOLERANCE_METERS) break;
    let t = (a * fb - b * fa) / (fb - fa);
    if (iteration % 3 === 2) {
      if (width > 0.5 * previousWidth) t = 0.5 * (a + b);
      previousWidth = width;
    }
    if (!(t > a && t < b)) t = 0.5 * (a + b);
    const ft = lineOffset(t, latitude, threshold);
    if (Number.isNaN(ft)) {
      t = 0.5 * (a + b);
      const fm = lineOffset(t, latitude, threshold);
      if (Number.isNaN(fm)) break;
      if (fm >= 0 === fa >= 0) {
        a = t;
        fa = fm;
      } else {
        b = t;
        fb = fm;
      }
      side = 0;
      continue;
    }
    if (ft >= 0 === fb >= 0) {
      b = t;
      fb = ft;
      if (side === -1) fa *= 0.5;
      side = -1;
    } else {
      a = t;
      fa = ft;
      if (side === 1) fb *= 0.5;
      side = 1;
    }
  }
  return 0.5 * (a + b);
}

// Per-piece crossing cache, keyed by threshold (slices share their latitude limits).
const crossingKeys = new Float64Array(16);
const crossingValues = new Float64Array(16);
let crossingCount = 0;

// The current piece (parameter range, endpoint latitudes and relative longitudes) and the part
// being built on it.
let pieceA = 0;
let pieceB = 0;
let pieceLatA = 0;
let pieceLatB = 0;
let pieceLonA = 0;
let pieceLonB = 0;
let partFrom = 0;
let partTo = 0;

/** Restrict `[partFrom, partTo]` to where `value ≥ threshold` (`atLeast`) or `value < threshold`. */
function constrain(latitude: boolean, threshold: number, atLeast: boolean): void {
  const fa = (latitude ? pieceLatA : pieceLonA) - threshold;
  const fb = (latitude ? pieceLatB : pieceLonB) - threshold;
  const insideA = fa >= 0 === atLeast;
  const insideB = fb >= 0 === atLeast;
  if (insideA && insideB) return;
  if (!insideA && !insideB) {
    partTo = -Infinity;
    return;
  }
  const key = latitude ? threshold : threshold + 1000;
  let t = NaN;
  for (let index = 0; index < crossingCount; index++) {
    if (crossingKeys[index] === key) t = crossingValues[index];
  }
  if (Number.isNaN(t)) {
    t = findCrossing(pieceA, fa, pieceB, fb, latitude, threshold);
    if (crossingCount < crossingKeys.length) {
      crossingKeys[crossingCount] = key;
      crossingValues[crossingCount] = t;
      crossingCount++;
    }
  }
  if (insideA) partTo = Math.min(partTo, t);
  else partFrom = Math.max(partFrom, t);
}

/** Merges `[from, to]` into the sorted parts in `out`; returns the new part count. */
function addPart(out: Float64Array, count: number, from: number, to: number): number {
  for (let index = 0; index < count; index++) {
    const start = out[index * 2];
    const end = out[index * 2 + 1];
    if (
      from <= end + 2 * CROSSING_TOLERANCE_METERS &&
      to >= start - 2 * CROSSING_TOLERANCE_METERS
    ) {
      out[index * 2] = Math.min(start, from);
      out[index * 2 + 1] = Math.max(end, to);
      return count;
    }
  }
  let index = count;
  while (index > 0 && out[(index - 1) * 2] > from) {
    out[index * 2] = out[(index - 1) * 2];
    out[index * 2 + 1] = out[(index - 1) * 2 + 1];
    index--;
  }
  out[index * 2] = from;
  out[index * 2 + 1] = to;
  return count + 1;
}

/**
 * Parts of the current line inside the region on the piece `[a, b]`, along which latitude and
 * relative longitude are both monotone, so each slice holds one interval bounded by at most four
 * crossings. Appends them to `out`; returns the new part count.
 */
function clipPiece(a: number, b: number, out: Float64Array, count: number): number {
  if (!(a < b) || !evaluateLine(a)) return count;
  pieceLatA = lineLat;
  pieceLonA = lineLon;
  if (!evaluateLine(b)) return count;
  pieceLatB = lineLat;
  pieceLonB = lineLon;
  pieceA = a;
  pieceB = b;
  crossingCount = 0;
  const minLat = Math.min(pieceLatA, pieceLatB);
  const maxLat = Math.max(pieceLatA, pieceLatB);
  const minLon = Math.min(pieceLonA, pieceLonB);
  const maxLon = Math.max(pieceLonA, pieceLonB);
  for (const slice of getEarthRegionSlices(lineCrs)) {
    const west = slice.west - lineCentralMeridian;
    const east = slice.east - lineCentralMeridian;
    if (slice.south > maxLat || slice.north <= minLat || west > maxLon || east <= minLon) {
      continue;
    }
    partFrom = a;
    partTo = b;
    constrain(true, slice.south, true);
    constrain(true, slice.north, false);
    constrain(false, west, true);
    constrain(false, east, false);
    if (partFrom < partTo) count = addPart(out, count, partFrom, partTo);
  }
  return count;
}

const clipBounds = new Float64Array(4);
const clipParts = new Float64Array(8);

/**
 * Parts of the constant-easting (`axis` "easting") or constant-northing line `value` inside the
 * UTM region `crs`, as `[from, to]` ranges of the other coordinate written to `out` (length ≥ 6).
 * Returns the part count (0–3; three only for eastings in zone 31N, around the 31V notch and the
 * wider 31X). Region membership is the classifier's own: each crossing of a region slice edge is
 * found by root-finding on the unprojected latitude or longitude, to 0.1 mm.
 */
export function clipEarthGridLine(
  crs: LgrsCrsId,
  axis: "easting" | "northing",
  value: number,
  out: Float64Array
): number {
  if (!isUtmCrs(crs) || !Number.isFinite(value)) return 0;
  getEarthRegionBounds(crs, clipBounds);
  lineCrs = crs;
  lineEasting = axis === "easting";
  lineValue = value;
  lineCentralMeridian = getUtmCentralMeridian(getUtmZone(crs));
  let count = 0;
  if (lineEasting) {
    if (value < clipBounds[0] || value > clipBounds[2]) return 0;
    count = clipPiece(clipBounds[1], clipBounds[3], clipParts, 0);
  } else {
    if (value < clipBounds[1] || value > clipBounds[3]) return 0;
    // Latitude along a northing line turns at the central meridian (E = FE).
    count = clipPiece(clipBounds[0], UTM_FALSE_EASTING, clipParts, 0);
    count = clipPiece(UTM_FALSE_EASTING, clipBounds[2], clipParts, count);
  }
  count = Math.min(count, Math.floor(out.length / 2));
  for (let index = 0; index < count * 2; index++) out[index] = clipParts[index];
  return count;
}

/** Whether a region grid line is the equator, which is drawn as the framework seam. */
export function isEarthSeamGridLine(
  crs: LgrsCrsId,
  axis: "easting" | "northing",
  value: number
): boolean {
  return axis === "northing" && isUtmCrs(crs) && value === getUtmFalseNorthing(crs);
}

// * CANDIDATE REGIONS ─────────────────────────────────────────────────

/** Whether `[west, east)` overlaps the envelope's longitudes (unwrapped past 180°). */
function overlapsLongitudes(west: number, east: number, envelope: LgrsViewEnvelope): boolean {
  if (envelope.fullLon) return true;
  const { minLon, maxLon } = envelope;
  return (west <= maxLon && east > minLon) || (west + 360 <= maxLon && east + 360 > minLon);
}

const candidateSeen = new Uint8Array(CRS_COUNT);

/**
 * UPS caps and UTM regions that may be visible: every region with a slice overlapping the
 * envelope (so exception slices are found even when no sample falls in them), plus every
 * sampled CRS. Caps first, then UTM by CRS id.
 */
export function getEarthCandidateRegions(
  envelope: LgrsViewEnvelope,
  samples: LgrsViewSamples
): LgrsCrsId[] {
  candidateSeen.fill(0);
  const { minLat, maxLat } = envelope;
  for (let crs = 0; crs < CRS_COUNT; crs++) {
    for (const slice of getEarthRegionSlices(crs)) {
      if (
        slice.south <= maxLat &&
        (slice.north > minLat || (slice.north === 90 && minLat === 90)) &&
        overlapsLongitudes(slice.west, slice.east, envelope)
      ) {
        candidateSeen[crs] = 1;
        break;
      }
    }
  }
  for (let index = 0; index < samples.count; index++) {
    if (isValidEarthCrs(samples.crs[index])) candidateSeen[samples.crs[index]] = 1;
  }
  const regions: LgrsCrsId[] = [];
  for (let crs = 0; crs < CRS_COUNT; crs++) if (candidateSeen[crs]) regions.push(crs);
  return regions;
}

// * FRAMEWORK ─────────────────────────────────────────────────────────

type MeridianSegment = { lon: number; from: number; to: number };

/**
 * Zone-boundary meridian segments: the west edge of every UTM slice, merged where they continue
 * one another (e.g. 6° E is a boundary for [-80, 56) and [64, 72) but not in the 32V/31X slices).
 */
function buildMeridianSegments(): MeridianSegment[] {
  const segments: MeridianSegment[] = [];
  for (let zone = 1; zone <= UTM_ZONE_COUNT; zone++) {
    for (const hemisphere of ["S", "N"] as const) {
      for (const slice of getEarthRegionSlices(getUtmCrsId(zone, hemisphere))) {
        segments.push({ lon: slice.west, from: slice.south, to: slice.north });
      }
    }
  }
  segments.sort((a, b) => a.lon - b.lon || a.from - b.from);
  const merged: MeridianSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.lon === segment.lon && last.to === segment.from) last.to = segment.to;
    else merged.push({ ...segment });
  }
  return merged;
}

let meridianSegments: MeridianSegment[] | null = null;

/** Band parallels C–X, with the equator and the 80° S / 84° N UTM/UPS seams. */
const SEAM_PARALLELS: readonly number[] = Object.freeze([
  UTM_MIN_LATITUDE,
  ...Array.from({ length: 19 }, (_, index) => -72 + index * 8),
  UTM_MAX_LATITUDE,
]);

/**
 * Box-tier seams inside the envelope: zone boundaries (exception edges as partial
 * meridians), band parallels, the equator and the 80° S / 84° N seams, all of kind `seam`.
 * There is no zone tier, so `zoneTier` adds nothing.
 */
export function getEarthFrameworkLines(
  envelope: LgrsViewEnvelope,
  _zoneTier: boolean
): LgrsFrameworkLine[] {
  const { minLat, maxLat, minLon, maxLon, fullLon } = envelope;
  const lines: LgrsFrameworkLine[] = [];
  meridianSegments ??= buildMeridianSegments();
  for (const segment of meridianSegments) {
    const from = Math.max(segment.from, minLat);
    const to = Math.min(segment.to, maxLat);
    if (!(from < to)) continue;
    if (fullLon || (segment.lon >= minLon && segment.lon <= maxLon)) {
      lines.push({ kind: "seam", axis: "meridian", value: segment.lon, from, to });
    }
    const wrapped = segment.lon + 360;
    if (!fullLon && wrapped >= minLon && wrapped <= maxLon) {
      lines.push({ kind: "seam", axis: "meridian", value: wrapped, from, to });
    }
  }
  for (const lat of SEAM_PARALLELS) {
    if (lat >= minLat && lat <= maxLat) {
      lines.push({ kind: "seam", axis: "parallel", value: lat, from: minLon, to: maxLon });
    }
  }
  return lines;
}
