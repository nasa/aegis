/**
 * Newton Path Planner: browser-only plans of a Newton A* path between two points. Plans live
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
  /** Start (0) or goal (1) when Newton reports that point as not traversable. */
  blockedWaypoints: number[];
};

type PathPlanRequest = {
  status: PathPlanRequestStatus;
  /** `newtonInputSignature` of the points and params the request is for. */
  inputSignature: string | null;
  /** Latest row from the server; may be unfinished or for older points. */
  row: NewtonTraverseRow | null;
  error: PathPlanError | null;
};

interface PathPlan {
  uuid: string;
  createdAt: string;
  color: string;
  start: AEGISPoint;
  goal: AEGISPoint;
  /** False until the user moves S or G; the starting points are never sent to Newton. */
  pointsTouched: boolean;
  params: NewtonTraverseParams;
  request: PathPlanRequest;
}

interface PathPlannerState {
  plans: PathPlan[];
  selectedPlanUuid: string | null;
}
