/**
 * Body-neutral region geometry for the dynamic grid: polar-cap regions (a disc around the pole
 * in projected coordinates), dispatch to the system for zone regions, adaptive densification of
 * curves into map coordinates, and polyline clipping to the view.
 */

/** E/N bounding box of a polar cap, written to `out` as `[minE, minN, maxE, maxN]`. */
export function getCapBounds(cap: LgrsCap, out: Float64Array): void {
  out[0] = cap.centreE - cap.radius;
  out[1] = cap.centreN - cap.radius;
  out[2] = cap.centreE + cap.radius;
  out[3] = cap.centreN + cap.radius;
}

/**
 * The part of the constant-easting (`axis` "easting") or constant-northing line `value` inside
 * the cap disc, as a `[from, to]` range of the other coordinate written to `out`. Returns the
 * number of parts (0–1).
 */
export function clipGridLineToCap(
  cap: LgrsCap,
  axis: "easting" | "northing",
  value: number,
  out: Float64Array
): number {
  const delta = value - (axis === "easting" ? cap.centreE : cap.centreN);
  const remainingSquared = cap.radius ** 2 - delta ** 2;
  if (remainingSquared < 0) return 0;
  const halfLength = Math.sqrt(remainingSquared);
  const centre = axis === "easting" ? cap.centreN : cap.centreE;
  out[0] = centre - halfLength;
  out[1] = centre + halfLength;
  return 1;
}

/** E/N bounding box of a whole region (cap or zone), written to `out`. */
export function getRegionBounds(
  system: LgrsGridSystem,
  crs: LgrsCrsId,
  cap: LgrsCap | null,
  out: Float64Array
): void {
  if (cap) getCapBounds(cap, out);
  else system.getRegionBounds(crs, out);
}

/**
 * Parts of the constant-E/N line `value` inside the region of `crs`, as `[from, to]` ranges of
 * the other coordinate written to `out` (length ≥ 6). Returns the number of parts (0–3).
 */
export function clipGridLineToRegion(
  system: LgrsGridSystem,
  crs: LgrsCrsId,
  cap: LgrsCap | null,
  axis: "easting" | "northing",
  value: number,
  out: Float64Array
): number {
  return cap
    ? clipGridLineToCap(cap, axis, value, out)
    : system.clipGridLine(crs, axis, value, out);
}

const curvePoint = new Float64Array(2);
const ENDPOINT_BISECTIONS = 30;

class CurveDensifier {
  private evaluate: LgrsCurveEvaluator = null;
  private toleranceSquared = 0;
  private jumpSquared = 0;
  private maxDepth = 0;
  private runs: number[][] = null;
  private current: number[] = null;

  run(
    evaluate: LgrsCurveEvaluator,
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
  evaluate: LgrsCurveEvaluator,
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
