/**
 * Newton A* paths as AEGIS serves them (`/api/v1/newton/...`). AEGIS keeps no Newton state:
 * a client posts its request, keeps the `traverseId`, and polls Newton's job by id. The
 * planet comes from the mission named in `?missionId=`.
 */

/**
 * Newton's job status.
 * - `pending`: accepted, possibly waiting for a free planning slot on Newton.
 * - `in_progress`: planning.
 * - `succeeded` / `failed` / `cancelled`: finished.
 */
type NewtonTraverseStatus = Newton.WorkStatus;

/** Planning parameters. An omitted or null value uses Newton's default. */
type NewtonTraverseParams = {
  slopeLimit?: number | null;
  slopeBufferM?: number | null;
};

type NewtonTraversePostData = {
  /** Start, any intermediate points, goal. */
  waypoints: AEGISPoint[];
  params?: NewtonTraverseParams;
};

type NewtonTraverseBatchPostData = {
  traverses: NewtonTraversePostData[];
};

/** Newton's error model. */
type NewtonTraverseError = {
  code: string;
  message: string;
  details: Record<string, unknown>[];
};

/**
 * Newton accepted the request. `cached` and `deduplicated` ids are shared with other
 * callers, so never cancel them.
 */
type NewtonTraverseSubmission = {
  traverseId: string;
  /** `newtonInputSignature` of the request as sent. */
  inputSignature: string;
  /** Newton's `request_hash`. Compare only `v1:` values. */
  requestHash: string | null;
  reuse: NewtonTraverseReuse;
};

type NewtonTraverseMapInfo = {
  name: string;
  type: string;
  /** Metres per pixel, `[x, y]`. */
  resolution: [number, number];
};

/** A Newton job as AEGIS serves it. */
type NewtonTraverseResult = {
  traverseId: string;
  status: NewtonTraverseStatus;
  /** A cancel was accepted; the job may still be stopping. */
  cancelRequested: boolean;
  /** The waypoints Newton was given. */
  waypoints: AEGISPoint[];
  params: NewtonTraverseParams;
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
};

/**
 * One answer per entry, in order. A rejected request carries Newton's `error`; a Newton
 * failure (`no_path`, …) is a `success` carrying a `failed` result. `httpStatus` is set only
 * on errors: `400` rejected, `404` unknown id (post again), `503` Newton unavailable (retry).
 */
type NewtonEntryResponse<T> = WrappedResponse<T> & {
  httpStatus?: number;
  error?: NewtonTraverseError;
};

type NewtonTraverseSubmitResponse = NewtonEntryResponse<NewtonTraverseSubmission>;

type NewtonTraverseResultResponse = NewtonEntryResponse<NewtonTraverseResult>;

type NewtonHealthReport = {
  enabled: boolean;
  /** Newton's `/health`, or null when it couldn't be reached. */
  newton: Newton.Health | null;
  newtonError: string | null;
};
