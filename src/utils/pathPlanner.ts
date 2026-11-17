/** Newton Path Planner helpers: row matching and user-facing failure messages. */
import { newtonInputSignature, planetFromRadius } from "utils/newtonInputs";

/** Is the plan's latest row for its current points and params? */
export function isPathPlanRowCurrent(
  plan: Pick<PathPlan, "start" | "goal" | "params" | "request">,
  planetRadius: number | null | undefined
): boolean {
  const planet = planetFromRadius(planetRadius);
  const row = plan.request.row;
  if (!planet || !row) return false;
  return row.inputSignature === newtonInputSignature(planet, [plan.start, plan.goal], plan.params);
}

const WAYPOINT_NAMES = ["Start", "Goal"];

const waypointName = (index: number) => WAYPOINT_NAMES[index] ?? `Point ${index + 1}`;

/** Start (0) / goal (1) indices Newton reported as not traversable. */
function blockedWaypoints(error: NewtonTraverseError): number[] {
  if (error.code !== "waypoint_not_traversable") return [];
  return (error.details ?? [])
    .map((detail) => detail?.waypoint)
    .filter((index): index is number => Number.isInteger(index) && (index as number) >= 0);
}

/** The message for a finished Newton row that has no path, or null if it succeeded. */
export function pathPlanErrorFromRow(row: NewtonTraverseRow): PathPlanError | null {
  if (row.status === "succeeded") return null;
  if (row.status === "cancelled")
    return { message: "Newton cancelled the request", retryable: true, blockedWaypoints: [] };
  const error = row.error;
  switch (error?.code) {
    case "no_slope_map":
      return { message: "Outside Newton coverage", retryable: false, blockedWaypoints: [] };
    case "waypoint_not_traversable": {
      const blocked = blockedWaypoints(error);
      const names = blocked.length ? blocked.map(waypointName).join(" and ") : "A point";
      return {
        message: `${names} ${blocked.length > 1 ? "are" : "is"} on steep or blocked terrain`,
        retryable: false,
        blockedWaypoints: blocked,
      };
    }
    case "no_path":
      return {
        message: "No route between start and goal",
        retryable: false,
        blockedWaypoints: [],
      };
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
