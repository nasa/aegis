/**
 * Ambient types for the Newton REST API wire format (see Newton's API docs).
 * Field names match the JSON exactly. Reference them as `Newton.TraverseProblem`, etc.
 */
declare namespace Newton {
  type Planet = "moon" | "earth";

  /** `[lon, lat]` in the planet's geodetic CRS. */
  type LonLat = [number, number];

  type WorkStatus = "pending" | "in_progress" | "succeeded" | "failed" | "cancelled";

  type MapType = "slope" | "elevation" | "aspect" | "tri" | "obstacle";

  type ErrorCode =
    | "invalid_request"
    | "unknown_field"
    | "dropped_field"
    | "no_slope_map"
    | "waypoint_not_traversable"
    | "no_path"
    | "not_found"
    | "already_finished"
    | "payload_too_large"
    | "service_unavailable"
    | "internal_error";

  /** Newton's error model. `code` is usually an `ErrorCode`; unknown codes still parse. */
  interface Error {
    code: string;
    message: string;
    details: Record<string, unknown>[];
  }

  interface LineString {
    type: "LineString";
    coordinates: number[][];
  }

  interface MapInfo {
    name: string;
    planet: Planet;
    type: MapType;
    crs: string;
    extent: [number, number, number, number];
    resolution: [number, number];
    description?: string;
  }

  interface TerrainCacheStats {
    slopes: number;
    terrains: number;
    bytes: number;
    budget_bytes: number;
    slope_hits: number;
    slope_misses: number;
    terrain_hits: number;
    terrain_misses: number;
    evictions: number;
  }

  interface Health {
    status: string;
    sha: string;
    map_count: number;
    terrain_cache?: TerrainCacheStats;
  }

  /** The subset of Newton's `TraverseProblem` that AEGIS sends. */
  interface TraverseProblem {
    planet: Planet;
    waypoints: LonLat[];
    method: "astar";
    slope_limit?: number;
    slope_buffer_m?: number;
  }

  interface PostTraverseResponse {
    traverse_id: string;
    request_hash?: string | null;
    cached?: boolean;
    deduplicated?: boolean;
  }

  interface Traverse {
    traverse_problem: Record<string, unknown>;
    method: string;
    request_hash?: string | null;
    effective_problem?: Record<string, unknown> | null;
    status: WorkStatus;
    cancel_requested?: boolean;
    runtime: number | null;
    path: LineString | null;
    map_info?: MapInfo[];
    error?: Error;
  }

  interface CancelTraverseResponse {
    status: WorkStatus;
    cancel_requested?: boolean;
  }

  interface MapsResponse {
    maps: MapInfo[];
    next_cursor?: string | null;
  }
}

/** How Newton handled a `POST /traverses`. */
type NewtonTraverseReuse = "new" | "cached" | "deduplicated";

interface NewtonPostedTraverse {
  traverseId: string;
  /** Newton's `request_hash`, or null when it sent none. Compare only `v1:` values. */
  requestHash: string | null;
  reuse: NewtonTraverseReuse;
}

type NewtonTransientReason =
  "disabled" | "timeout" | "network" | "http" | "non_json" | "unexpected_body";

/**
 * Every client call resolves to one of these and never throws.
 * - `ok`: a 2xx with the expected body.
 * - `rejected`: Newton refused the request (400, 404, 409, 413, 422). Retrying won't help.
 * - `transient`: Newton is unreachable or unhealthy (5xx, proxy HTML, timeout, network,
 *   unexpected body, or no `NEWTON_BASE_URL`). A later retry may succeed.
 */
type NewtonResult<T> =
  | { kind: "ok"; status: number; data: T }
  | { kind: "rejected"; status: number; error: Newton.Error }
  | {
      kind: "transient";
      status: number | null;
      reason: NewtonTransientReason;
      message: string;
      error?: Newton.Error;
    };

interface NewtonClientOptions {
  /** Base URL including `/api/v1`. Empty or unset disables the client. */
  baseUrl: string | null | undefined;
  timeoutMs: number;
  fetch?: typeof fetch;
}

interface NewtonTraverseRequest {
  planet: Newton.Planet;
  /** Start, any intermediate points, goal. */
  waypoints: AEGISPoint[];
  slopeLimit?: number | null;
  slopeBufferM?: number | null;
}

type NewtonBuildResult =
  { kind: "ok"; problem: Newton.TraverseProblem } | { kind: "invalid"; message: string };
