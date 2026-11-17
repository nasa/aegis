/**
 * Newton Path Planner: browser-only plans of a Newton A* path through a start, any midpoints
 * and a goal. Plans live
 * in Redux for the tab's lifetime and are never written to Automerge, cookies or storage.
 */

/**
 * - `idle`: nothing to request (the points haven't been moved yet, or are too close together).
 * - `debouncing`: waiting for the points to settle.
 * - `pending`: a request or poll for the current points is in flight.
 * - `ready`: the row for the current points has finished (succeeded or failed).
 * - `error`: the request itself failed.
 */
type PathPlanRequestStatus = "idle" | "debouncing" | "pending" | "ready" | "error";

type PathPlanError = {
  message: string;
  retryable: boolean;
  /** Indices into `PathPlan.points` that Newton reports as not traversable. */
  blockedWaypoints: number[];
};

type PathPlanRequest = {
  status: PathPlanRequestStatus;
  /** `newtonInputSignature` of the points and params the request is for. */
  inputSignature: string | null;
  /** Latest row from the server; may be unfinished or for older points. */
  row: NewtonTraverseRow | null;
  /**
   * Latest row that found a path. Kept, drawn greyed out, while newer points are planned or
   * fail, until a newer path replaces it.
   */
  pathRow: NewtonTraverseRow | null;
  error: PathPlanError | null;
};

interface PathPlan {
  uuid: string;
  createdAt: string;
  color: string;
  /** Start, any midpoints, goal (at least two); all are sent to Newton as waypoints. */
  points: AEGISPoint[];
  /** False until the user edits the points; the starting points are never sent to Newton. */
  pointsTouched: boolean;
  params: NewtonTraverseParams;
  request: PathPlanRequest;
}

interface PathPlannerState {
  plans: PathPlan[];
  selectedPlanUuid: string | null;
}
