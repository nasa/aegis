/**
 * Newton A* paths as AEGIS serves them (`/api/v1/newton/...`). One row per distinct
 * request (planet, rounded waypoints, method, parameters), shared by every caller.
 */

/**
 * - `queued`: waiting for a free Newton slot, or for a retry after Newton was unavailable.
 * - `submitting`: AEGIS is posting it to Newton.
 * - `pending` / `in_progress`: Newton has the job.
 * - `succeeded` / `failed` / `cancelled`: finished.
 */
type NewtonTraverseStatus =
  "queued" | "submitting" | "pending" | "in_progress" | "succeeded" | "failed" | "cancelled";

/** Planning parameters. An omitted or null value uses Newton's default. */
type NewtonTraverseParams = {
  slopeLimit?: number | null;
  slopeBufferM?: number | null;
};

type NewtonTraverseRequestBody = {
  /** Start, any intermediate points, goal. */
  waypoints: AEGISPoint[];
  params?: NewtonTraverseParams;
};

type NewtonTraversePostData = NewtonTraverseRequestBody & { planet: "moon" | "earth" };

type NewtonTraverseBatchPostData = {
  planet: "moon" | "earth";
  requests: NewtonTraverseRequestBody[];
};

/** Newton's error model. On a `queued` row it describes the last failed submission. */
type NewtonTraverseError = {
  code: string;
  message: string;
  details: Record<string, unknown>[];
};

type NewtonTraverseMapInfo = {
  name: string;
  type: string;
  /** Metres per pixel, `[x, y]`. */
  resolution: [number, number];
};

type NewtonTraverseRow = {
  uuid: string;
  status: NewtonTraverseStatus;
  planet: "moon" | "earth";
  /** The request's waypoints, rounded to 1e-7°. */
  waypoints: AEGISPoint[];
  params: NewtonTraverseParams;
  /** Newton's `request_hash`. Compare only `v1:` values. */
  requestHash: string | null;
  /** Douglas–Peucker at half the slope map's resolution, ends snapped to the waypoints. */
  path: AEGISPoint[] | null;
  segmentDistances: number[] | null;
  /** Vertex count of Newton's raw path (about one per metre). */
  rawVertexCount: number | null;
  /** Newton's raw path. Only returned with `?raw=1`. */
  rawPath?: AEGISPoint[] | null;
  mapInfo: NewtonTraverseMapInfo[] | null;
  runtimeMs: number | null;
  error: NewtonTraverseError | null;
  createdAt: string;
  updatedAt: string;
};

type NewtonTraverseBatchResult =
  { status: "success"; data: NewtonTraverseRow } | { status: "error"; message: string };

type NewtonHealthReport = {
  enabled: boolean;
  /** Newton's `/health`, or null when it couldn't be reached. */
  newton: Newton.Health | null;
  newtonError: string | null;
  maxInFlight: number;
  counts: Partial<Record<NewtonTraverseStatus, number>>;
};
