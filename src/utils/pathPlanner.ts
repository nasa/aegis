/** Newton Path Planner helpers: row matching and user-facing failure messages. */
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";
import { newtonInputSignature, planetFromRadius } from "utils/newtonInputs";

/** Is `row` (by default the plan's latest row) for the plan's current points and params? */
export function isPathPlanRowCurrent(
  plan: Pick<PathPlan, "points" | "params" | "request">,
  planetRadius: number | null | undefined,
  row: NewtonTraverseRow | null = plan.request.row
): boolean {
  const planet = planetFromRadius(planetRadius);
  if (!planet || !row) return false;
  return row.inputSignature === newtonInputSignature(planet, plan.points, plan.params);
}

/** Great-circle length of the line through `points`. */
export function pathLengthMeters(
  points: readonly AEGISPoint[],
  planetRadius: number | null | undefined
): number {
  let meters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    meters += getDistanceBetweenTwoCoordinates(points[i], points[i + 1], planetRadius) ?? 0;
  }
  return meters;
}

/** "Start", "Goal", or "Midpoint n" (1-based) for a point of a `count`-point plan. */
export function pathPlanPointName(index: number, count: number): string {
  if (index === 0) return "Start";
  if (index === count - 1) return "Goal";
  return `Midpoint ${index}`;
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Point indices Newton reported as not traversable. */
function blockedWaypoints(error: NewtonTraverseError): number[] {
  if (error.code !== "waypoint_not_traversable") return [];
  return (error.details ?? [])
    .map((detail) => detail?.waypoint)
    .filter((index): index is number => Number.isInteger(index) && (index as number) >= 0);
}

/** `from_waypoint` of each `no_path` leg. */
function blockedLegs(error: NewtonTraverseError): number[] {
  return (error.details ?? [])
    .map((detail) => detail?.from_waypoint)
    .filter((index): index is number => Number.isInteger(index) && (index as number) >= 0);
}

/** The message for a finished Newton row that has no path, or null if it succeeded. */
export function pathPlanErrorFromRow(row: NewtonTraverseRow): PathPlanError | null {
  if (row.status === "succeeded") return null;
  if (row.status === "cancelled")
    return { message: "Newton cancelled the request", retryable: true, blockedWaypoints: [] };
  const error = row.error;
  const count = row.waypoints?.length ?? 2;
  const name = (index: number) => pathPlanPointName(index, count);
  switch (error?.code) {
    case "no_slope_map":
      return { message: "Outside Newton coverage", retryable: false, blockedWaypoints: [] };
    case "waypoint_not_traversable": {
      const blocked = blockedWaypoints(error);
      const names = blocked.length ? joinNames(blocked.map(name)) : "A point";
      return {
        message: `${names} ${blocked.length > 1 ? "are" : "is"} on steep or blocked terrain`,
        retryable: false,
        blockedWaypoints: blocked,
      };
    }
    case "no_path": {
      const legs = blockedLegs(error);
      const where =
        legs.length === 1 && count > 2
          ? `${name(legs[0])} and ${name(legs[0] + 1)}`
          : count > 2
            ? "the points"
            : "start and goal";
      return { message: `No route between ${where}`, retryable: false, blockedWaypoints: [] };
    }
    case "timeout":
      return { message: "Newton took too long", retryable: true, blockedWaypoints: [] };
    default:
      return {
        message: error?.message ? `Newton failed: ${error.message}` : "Newton failed",
        retryable: true,
        blockedWaypoints: [],
      };
  }
}

/** The message for a request that didn't return a row. */
export function pathPlanErrorFromResponse(response: NewtonTraverseResponse): PathPlanError {
  const status = response.httpStatus;
  if (status === 401) {
    return {
      message: "You don't have access to this mission",
      retryable: false,
      blockedWaypoints: [],
    };
  }
  if (status === 400) {
    return {
      message: response.message || "Newton rejected the request",
      retryable: false,
      blockedWaypoints: [],
    };
  }
  return { message: "Newton unavailable, try again", retryable: true, blockedWaypoints: [] };
}
