/**
 * Newton request identity, shared by client and server. A Newton row applies to a
 * traverse or measurement when its `inputSignature` equals `newtonInputSignature` of the
 * current geometry and parameters.
 */

/** Waypoints are rounded to this many decimal degrees (≤ 1.1 cm). */
export const NEWTON_ROUND_DIGITS = 7;

const ROUND_FACTOR = 10 ** NEWTON_ROUND_DIGITS;

/** Above this radius a mission is Earth-scale; below it, Moon-scale. */
const EARTH_MOON_THRESHOLD_M = 4_000_000;
const MOON_RADIUS_M = 1_737_400;
const PLANET_RADIUS_TOLERANCE = 0.01;

export function roundNewtonCoord(value: number): number {
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
}

/**
 * The Newton planet for a mission's `planetRadius`. A missing radius is the Moon (the
 * AEGIS default). Moon-scale radii other than the Moon's (e.g. Mars) are unsupported.
 */
export function planetFromRadius(planetRadius: number | null | undefined): Newton.Planet | null {
  if (planetRadius == null) return "moon";
  if (!Number.isFinite(planetRadius) || planetRadius <= 0) return null;
  if (planetRadius > EARTH_MOON_THRESHOLD_M) return "earth";
  const relative = Math.abs(planetRadius - MOON_RADIUS_M) / MOON_RADIUS_M;
  return relative <= PLANET_RADIUS_TOLERANCE ? "moon" : null;
}

/**
 * The canonical form of a Newton request: fixed key order, waypoints as rounded
 * `[lon, lat]`, omitted parameters left out. The server keys rows by its SHA-256.
 */
export function canonicalNewtonRequest(problem: Newton.TraverseProblem): string {
  const canonical: Record<string, unknown> = {
    planet: problem.planet,
    method: problem.method,
    waypoints: problem.waypoints,
  };
  if (problem.slope_limit != null) canonical.slope_limit = problem.slope_limit;
  if (problem.slope_buffer_m != null) canonical.slope_buffer_m = problem.slope_buffer_m;
  return JSON.stringify(canonical);
}

/** The `inputSignature` of the row the server returns for these inputs. */
export function newtonInputSignature(
  planet: Newton.Planet,
  waypoints: Pick<AEGISPoint, "lat" | "lng">[],
  params: NewtonTraverseParams = {}
): string {
  return canonicalNewtonRequest({
    planet,
    method: "astar",
    waypoints: waypoints.map((point) => [roundNewtonCoord(point.lng), roundNewtonCoord(point.lat)]),
    slope_limit: params.slopeLimit ?? undefined,
    slope_buffer_m: params.slopeBufferM ?? undefined,
  });
}
