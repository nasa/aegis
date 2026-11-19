/** Newton Path Planner helpers: result matching and user-facing failure messages. */
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";
import { newtonInputSignature, planetFromRadius } from "utils/newtonInputs";

/** Is `result` (by default the plan's latest) for the plan's current points and params? */
export function isPathPlanResultCurrent(
  plan: Pick<PathPlan, "points" | "params" | "request">,
  planetRadius: number | null | undefined,
  result: PathPlanResult | null = plan.request.result
): boolean {
  const planet = planetFromRadius(planetRadius);
  if (!planet || !result) return false;
  return result.inputSignature === newtonInputSignature(planet, plan.points, plan.params);
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

/** The message for a finished Newton job that has no path, or null if it succeeded. */
export function pathPlanErrorFromResult(
  result: Pick<NewtonTraverseResult, "status" | "error" | "waypoints">
): PathPlanError | null {
  if (result.status === "succeeded") return null;
  if (result.status === "cancelled")
    return { message: "Newton cancelled the request", retryable: true, blockedWaypoints: [] };
  const error = result.error;
  const count = result.waypoints?.length ?? 2;
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
    default:
      return {
        message: error?.message ? `Newton failed: ${error.message}` : "Newton failed",
        retryable: true,
        blockedWaypoints: [],
      };
  }
}

/** The message for a request that AEGIS or Newton refused, or that couldn't reach them. */
export function pathPlanErrorFromResponse(response: NewtonEntryResponse<unknown>): PathPlanError {
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

/** The Path Planner button's tooltip. */
export function newtonCoverageTooltip(coverage: PathPlannerCoverage | null): string {
  const title = "Newton Path Planner (experimental)";
  const supported = coverage?.status === "ready" && !!coverage.coverage?.supported;
  return supported ? title : `${title}: ${newtonCoverageMessage(coverage)}`;
}

/** Why the Newton Path Planner is unavailable, for its greyed-out button. */
export function newtonCoverageMessage(coverage: PathPlannerCoverage | null): string {
  if (!coverage || coverage.status === "idle" || coverage.status === "checking") {
    return "checking Newton coverage…";
  }
  if (coverage.status === "error" || !coverage.coverage) {
    return "Newton is not available";
  }
  switch (coverage.coverage.reason) {
    case "covered":
      return "available";
    case "no_slope_map":
      return "Newton has no slope map for this mission's area";
    case "unsupported_planet":
      return "Newton doesn't support this mission's planet";
    case "no_area":
      return "this mission has no DEM or lander location to check";
    case "disabled":
      return "Newton is not configured";
  }
  return "unavailable";
}
