/** Conversions between AEGIS types and the Newton wire format. */
import { roundNewtonCoord } from "utils/newtonInputs";

/** Newton needs at least a start and a goal. */
export const NEWTON_MIN_WAYPOINTS = 2;

/** `AEGISPoint` → rounded `[lon, lat]`, or null when the point has no location. */
export function aegisPointToLonLat(point: AEGISPoint | null | undefined): Newton.LonLat | null {
  const lat = point?.lat;
  const lng = point?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [roundNewtonCoord(lng), roundNewtonCoord(lat)];
}

/** `[lon, lat]` → `AEGISPoint`. */
export function lonLatToAegisPoint([lon, lat]: readonly number[]): AEGISPoint {
  return { lat, lng: lon };
}

/** GeoJSON LineString → AEGIS points. Malformed or missing input gives `[]`. */
export function lineStringToAegisPoints(line: Newton.LineString | null | undefined): AEGISPoint[] {
  if (!line || line.type !== "LineString" || !Array.isArray(line.coordinates)) return [];
  const points: AEGISPoint[] = [];
  for (const coord of line.coordinates) {
    if (!Array.isArray(coord) || coord.length < 2) return [];
    const [lon, lat] = coord;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
    points.push(lonLatToAegisPoint(coord));
  }
  return points;
}

/** AEGIS points → GeoJSON LineString, rounded like waypoints. Unlocated points are dropped. */
export function aegisPointsToLineString(points: readonly AEGISPoint[]): Newton.LineString {
  const coordinates: number[][] = [];
  for (const point of points) {
    const lonLat = aegisPointToLonLat(point);
    if (lonLat) coordinates.push(lonLat);
  }
  return { type: "LineString", coordinates };
}

/** Only `v1:` hashes are comparable; older jobs carry unprefixed values or null. */
export function isComparableHash(hash: string | null | undefined): hash is string {
  return typeof hash === "string" && /^v1:[0-9a-f]{64}$/.test(hash);
}

function optionalNumber(
  name: string,
  value: number | null | undefined,
  isValid: (v: number) => boolean
): { kind: "ok"; value: number | undefined } | { kind: "invalid"; message: string } {
  if (value == null) return { kind: "ok", value: undefined };
  if (!Number.isFinite(value) || !isValid(value)) {
    return { kind: "invalid", message: `invalid ${name}: ${value}` };
  }
  return { kind: "ok", value };
}

/**
 * Builds the POST body from an allow-list of fields. Newton rejects unknown fields
 * (`unknown_field`) and removed ones such as `obstacle_maps` (`dropped_field`), so
 * nothing else is ever copied in.
 */
export function buildTraverseProblem(request: NewtonTraverseRequest): NewtonBuildResult {
  if (request.planet !== "moon" && request.planet !== "earth") {
    return { kind: "invalid", message: `unsupported planet: ${String(request.planet)}` };
  }
  if (!Array.isArray(request.waypoints) || request.waypoints.length < NEWTON_MIN_WAYPOINTS) {
    return { kind: "invalid", message: `at least ${NEWTON_MIN_WAYPOINTS} waypoints are required` };
  }
  const waypoints: Newton.LonLat[] = [];
  for (const [index, point] of request.waypoints.entries()) {
    const lonLat = aegisPointToLonLat(point);
    if (!lonLat) return { kind: "invalid", message: `waypoint ${index} has no location` };
    if (lonLat[1] < -90 || lonLat[1] > 90) {
      return { kind: "invalid", message: `waypoint ${index} latitude is out of range` };
    }
    waypoints.push(lonLat);
  }

  const slopeLimit = optionalNumber("slopeLimit", request.slopeLimit, (v) => v > 0 && v <= 90);
  if (slopeLimit.kind === "invalid") return slopeLimit;
  const slopeBufferM = optionalNumber("slopeBufferM", request.slopeBufferM, (v) => v >= 0);
  if (slopeBufferM.kind === "invalid") return slopeBufferM;

  const problem: Newton.TraverseProblem = { planet: request.planet, waypoints, method: "astar" };
  if (slopeLimit.value !== undefined) problem.slope_limit = slopeLimit.value;
  if (slopeBufferM.value !== undefined) problem.slope_buffer_m = slopeBufferM.value;
  return { kind: "ok", problem };
}
