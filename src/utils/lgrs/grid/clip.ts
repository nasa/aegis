import {
  LGRS_MOON_RADIUS,
  LPS_DOMAIN_RADIUS,
  LPS_FALSE_EASTING,
  LPS_FALSE_NORTHING,
  LTM_FALSE_EASTING,
  LTM_FALSE_NORTHING_NORTH,
  LTM_FALSE_NORTHING_SOUTH,
  LTM_K0,
  LTM_MAX_ABS_LATITUDE,
  LTM_ZONE_WIDTH_DEGREES,
} from "../constants";
import { isLpsCrs, isSouthCrs } from "../crs";

/**
 * Region geometry for the dynamic grid: closed-form clipping of constant-E/N lines to an LGRS
 * region, adaptive densification of curves into map coordinates, and polyline clipping to the view.
 */

const DEG_TO_RAD = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const LTM_K0R = LTM_K0 * LGRS_MOON_RADIUS;
const HALF_ZONE_RADIANS = (LTM_ZONE_WIDTH_DEGREES / 2) * DEG_TO_RAD;
const TAN_HALF_ZONE = Math.tan(HALF_ZONE_RADIANS);
const SIN_MAX_LATITUDE = Math.sin(LTM_MAX_ABS_LATITUDE * DEG_TO_RAD);
const LPS_RADIUS_SQUARED = LPS_DOMAIN_RADIUS ** 2;

/** Widest LTM easting offset from the false easting (zone edge at the equator). */
const LTM_HALF_WIDTH = LTM_K0R * Math.atanh(Math.sin(HALF_ZONE_RADIANS));
/** Largest LTM northing offset from the false northing (zone edge at ±80°). */
const LTM_MAX_NORTHING_OFFSET =
  LTM_K0R * Math.atan2(Math.tan(LTM_MAX_ABS_LATITUDE * DEG_TO_RAD), Math.cos(HALF_ZONE_RADIANS));

export function getLtmFalseNorthing(crs: LgrsCrsId): number {
  return isSouthCrs(crs) ? LTM_FALSE_NORTHING_SOUTH : LTM_FALSE_NORTHING_NORTH;
}

/** E/N bounding box of a whole region, written to `out` as `[minE, minN, maxE, maxN]`. */
export function getRegionBounds(crs: LgrsCrsId, out: Float64Array): void {
  if (isLpsCrs(crs)) {
    out[0] = LPS_FALSE_EASTING - LPS_DOMAIN_RADIUS;
    out[1] = LPS_FALSE_NORTHING - LPS_DOMAIN_RADIUS;
    out[2] = LPS_FALSE_EASTING + LPS_DOMAIN_RADIUS;
    out[3] = LPS_FALSE_NORTHING + LPS_DOMAIN_RADIUS;
    return;
  }
  const falseNorthing = getLtmFalseNorthing(crs);
  const south = isSouthCrs(crs);
  out[0] = LTM_FALSE_EASTING - LTM_HALF_WIDTH;
  out[1] = south ? falseNorthing - LTM_MAX_NORTHING_OFFSET : falseNorthing;
  out[2] = LTM_FALSE_EASTING + LTM_HALF_WIDTH;
  out[3] = south ? falseNorthing : falseNorthing + LTM_MAX_NORTHING_OFFSET;
}

/**
 * Parts of the constant-easting (`axis` "easting") or constant-northing line `value` that lie in
 * the region of `crs`, as `[from, to]` ranges of the other coordinate written to `out` (length
 * ≥ 4). Returns the number of parts (0–2). LPS regions are the disc to ±80°. LTM regions are
 * `|Δλ| ≤ 4°`, `|lat| ≤ 80°` and the crs hemisphere; with `u = (E − FE)/(k₀R)` and
 * `D = (N − FN)/(k₀R)`, `lat = asin(sin D / cosh u)` and `Δλ = atan2(sinh u, cos D)`, so every
 * boundary crossing has a closed form.
 */
export function clipGridLineToRegion(
  crs: LgrsCrsId,
  axis: "easting" | "northing",
  value: number,
  out: Float64Array
): number {
  if (isLpsCrs(crs)) {
    const delta = value - (axis === "easting" ? LPS_FALSE_EASTING : LPS_FALSE_NORTHING);
    const remainingSquared = LPS_RADIUS_SQUARED - delta ** 2;
    if (remainingSquared < 0) return 0;
    const halfLength = Math.sqrt(remainingSquared);
    const centre = axis === "easting" ? LPS_FALSE_NORTHING : LPS_FALSE_EASTING;
    out[0] = centre - halfLength;
    out[1] = centre + halfLength;
    return 1;
  }

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

/** Curve point at parameter `t ∈ [0, 1]` in map coordinates; false when not finite. */
type CurveEvaluator = (t: number, out: Float64Array) => boolean;

const curvePoint = new Float64Array(2);
const ENDPOINT_BISECTIONS = 30;

class CurveDensifier {
  private evaluate: CurveEvaluator = null;
  private toleranceSquared = 0;
  private jumpSquared = 0;
  private maxDepth = 0;
  private runs: number[][] = null;
  private current: number[] = null;

  run(
    evaluate: CurveEvaluator,
    tolerance: number,
    maxDepth: number,
    jumpLength: number,
    runs: number[][]
  ): void {
    this.evaluate = evaluate;
    this.toleranceSquared = tolerance * tolerance;
    this.jumpSquared = jumpLength * jumpLength;
    this.maxDepth = maxDepth;
    this.runs = runs;
    this.current = null;

    let t0 = 0;
    let t1 = 1;
    const startFinite = evaluate(0, curvePoint);
    let x0 = curvePoint[0];
    let y0 = curvePoint[1];
    const endFinite = evaluate(1, curvePoint);
    let x1 = curvePoint[0];
    let y1 = curvePoint[1];
    if (!startFinite || !endFinite) {
      // Shrink towards the finite end (e.g. a pole that the map projection cannot show).
      if (!startFinite && !endFinite) {
        if (!evaluate(0.5, curvePoint)) return;
        this.run((t, out) => evaluate(t * 0.5, out), tolerance, maxDepth, jumpLength, runs);
        this.run((t, out) => evaluate(0.5 + t * 0.5, out), tolerance, maxDepth, jumpLength, runs);
        return;
      }
      let good = startFinite ? 0 : 1;
      let bad = startFinite ? 1 : 0;
      for (let step = 0; step < ENDPOINT_BISECTIONS; step++) {
        const middle = 0.5 * (good + bad);
        if (evaluate(middle, curvePoint)) good = middle;
        else bad = middle;
      }
      evaluate(good, curvePoint);
      if (startFinite) {
        t1 = good;
        x1 = curvePoint[0];
        y1 = curvePoint[1];
      } else {
        t0 = good;
        x0 = curvePoint[0];
        y0 = curvePoint[1];
      }
    }
    this.startRun(x0, y0);
    this.refine(t0, x0, y0, t1, x1, y1, 0);
    this.finishRun();
  }

  private startRun(x: number, y: number): void {
    this.finishRun();
    this.current = [x, y];
  }

  private finishRun(): void {
    if (this.current && this.current.length >= 4) this.runs.push(this.current);
    this.current = null;
  }

  private refine(
    t0: number,
    x0: number,
    y0: number,
    t1: number,
    x1: number,
    y1: number,
    depth: number
  ): void {
    const tm = 0.5 * (t0 + t1);
    if (!this.evaluate(tm, curvePoint)) {
      this.startRun(x1, y1);
      return;
    }
    const xm = curvePoint[0];
    const ym = curvePoint[1];
    const dx = xm - 0.5 * (x0 + x1);
    const dy = ym - 0.5 * (y0 + y1);
    if (dx * dx + dy * dy <= this.toleranceSquared) {
      this.current.push(x1, y1);
      return;
    }
    if (depth >= this.maxDepth) {
      // Still bent at the depth cap: a long chord here is a jump across a projection seam.
      const cx = x1 - x0;
      const cy = y1 - y0;
      if (cx * cx + cy * cy > this.jumpSquared) this.startRun(x1, y1);
      else this.current.push(xm, ym, x1, y1);
      return;
    }
    this.refine(t0, x0, y0, tm, xm, ym, depth + 1);
    this.refine(tm, xm, ym, t1, x1, y1, depth + 1);
  }
}

const densifier = new CurveDensifier();

/**
 * Appends to `runs` the map polyline(s) of the curve `evaluate(t)`, `t ∈ [0, 1]`. Segments are
 * halved until the curve midpoint is within `tolerance` of the chord, to `maxDepth`. The curve is
 * split where it is not finite or jumps by more than `jumpLength` at the depth cap.
 */
export function densifyCurve(
  evaluate: CurveEvaluator,
  tolerance: number,
  maxDepth: number,
  jumpLength: number,
  runs: number[][]
): void {
  densifier.run(evaluate, tolerance, maxDepth, jumpLength, runs);
}

/** Appends the parts of polyline `run` (flat `[x0, y0, …]`) inside `extent` to `out` (Liang–Barsky). */
export function clipRunToExtent(run: number[], extent: LgrsMapExtent, out: number[][]): void {
  const [minX, minY, maxX, maxY] = extent;
  let current: number[] = null;
  for (let index = 0; index + 3 < run.length; index += 2) {
    const ax = run[index];
    const ay = run[index + 1];
    const dx = run[index + 2] - ax;
    const dy = run[index + 3] - ay;
    let enter = 0;
    let exit = 1;
    let rejected = false;
    for (let edge = 0; edge < 4 && !rejected; edge++) {
      const p = edge === 0 ? -dx : edge === 1 ? dx : edge === 2 ? -dy : dy;
      const q =
        edge === 0 ? ax - minX : edge === 1 ? maxX - ax : edge === 2 ? ay - minY : maxY - ay;
      if (p === 0) {
        if (q < 0) rejected = true;
      } else {
        const r = q / p;
        if (p < 0) {
          if (r > exit) rejected = true;
          else if (r > enter) enter = r;
        } else if (r < enter) {
          rejected = true;
        } else if (r < exit) {
          exit = r;
        }
      }
    }
    if (rejected) {
      current = null;
      continue;
    }
    const endX = exit === 1 ? run[index + 2] : ax + exit * dx;
    const endY = exit === 1 ? run[index + 3] : ay + exit * dy;
    if (current && enter === 0) {
      current.push(endX, endY);
    } else {
      current = [
        enter === 0 ? ax : ax + enter * dx,
        enter === 0 ? ay : ay + enter * dy,
        endX,
        endY,
      ];
      out.push(current);
    }
    if (exit < 1) current = null;
  }
}
