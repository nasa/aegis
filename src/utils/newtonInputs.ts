/**
 * Newton request identity, shared by client and server.
 */

/** Waypoints are rounded to this many decimal degrees (≤ 1.1 cm). */
export const NEWTON_ROUND_DIGITS = 7;

const ROUND_FACTOR = 10 ** NEWTON_ROUND_DIGITS;

export function roundNewtonCoord(value: number): number {
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
}

/**
 * The Newton planet for a mission's planet. A missing planet is the Moon (the AEGIS default);
 * planets Newton has no maps for (e.g. Mars) are unsupported.
 */
export function newtonPlanet(planet: Planet | null | undefined): Newton.Planet | null {
  if (planet == null || planet === "moon") return "moon";
  return planet === "earth" ? "earth" : null;
}

/**
 * The canonical form of a Newton request: fixed key order, waypoints as rounded
 * `[lon, lat]`, omitted parameters left out.
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

/** The `inputSignature` the server returns when these inputs are submitted. */
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
