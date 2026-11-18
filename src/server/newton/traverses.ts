/**
 * Newton traverses for AEGIS clients. Stateless: Newton queues, caches and de-duplicates
 * jobs itself, so each call passes straight through and converts the answer.
 */
import { lineStringToAegisPoints, lonLatToAegisPoint } from "server/newton/v1/convert";
import {
  newtonCancelTraverse,
  newtonGetTraverse,
  newtonOptionsFromEnv,
  newtonPostTraverse,
} from "server/newton/v1/http-newton";
import { EARTH_RADIUS } from "utils/consts";
import { pathSegmentDistances, simplifyPathToEndpoints } from "utils/mapping/simplifyPath";
import { canonicalNewtonRequest } from "utils/newtonInputs";

const MOON_RADIUS_M = 1_737_400;
const DEFAULT_SLOPE_RESOLUTION_M = 1;
/** Newton calls made at once for one batch. */
export const NEWTON_BATCH_CONCURRENCY = 4;

export const isNewtonEnabled = (): boolean => !!newtonOptionsFromEnv().baseUrl;

const planetRadius = (planet: Newton.Planet): number =>
  planet === "earth" ? EARTH_RADIUS : MOON_RADIUS_M;

/** Half the slope map's resolution, the tolerance used when simplifying Newton's path. */
export function simplifyToleranceM(mapInfo: readonly Newton.MapInfo[] | null | undefined): number {
  const resolution = mapInfo?.find((map) => map.type === "slope")?.resolution?.[0];
  return (
    (Number.isFinite(resolution) && resolution > 0 ? resolution : DEFAULT_SLOPE_RESOLUTION_M) * 0.5
  );
}

/** Runs `fn` over `items`, at most `limit` at a time, keeping the order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** A failed Newton call as an entry: rejections keep Newton's status, the rest are 503. */
function failedEntry<T>(
  result: Exclude<NewtonResult<unknown>, { kind: "ok" }>
): NewtonEntryResponse<T> {
  if (result.kind === "rejected") {
    return {
      status: "error",
      message: result.error.message || result.error.code,
      httpStatus: result.status,
      error: result.error,
    };
  }
  return {
    status: "error",
    message: result.reason === "disabled" ? "Newton is not configured" : "Newton is unavailable",
    httpStatus: 503,
    ...(result.error ? { error: result.error } : {}),
  };
}

/** `POST /traverses`. Build `problem` with `buildTraverseProblem`. */
export async function submitNewtonTraverse(
  problem: Newton.TraverseProblem
): Promise<NewtonTraverseSubmitResponse> {
  const result = await newtonPostTraverse(problem);
  if (result.kind !== "ok") return failedEntry(result);
  return {
    status: "success",
    message: "Newton traverse submitted",
    data: { ...result.data, inputSignature: canonicalNewtonRequest(problem) },
  };
}

function paramsOf(problem: Newton.StoredTraverseProblem): NewtonTraverseParams {
  const params: NewtonTraverseParams = {};
  if (problem.slope_limit != null) params.slopeLimit = problem.slope_limit;
  if (problem.slope_buffer_m != null) params.slopeBufferM = problem.slope_buffer_m;
  return params;
}

/** Converts Newton's job, simplifying a successful path. */
export function toNewtonTraverseResult(
  traverseId: string,
  traverse: Newton.Traverse,
  raw = false
): NewtonTraverseResult {
  const problem = traverse.traverse_problem;
  const waypoints = (problem?.waypoints ?? []).map(lonLatToAegisPoint);
  const rawPoints = traverse.status === "succeeded" ? lineStringToAegisPoints(traverse.path) : [];
  const usable = rawPoints.length >= 2 && waypoints.length >= 2;
  const radius = planetRadius(problem?.planet);
  const path = usable
    ? simplifyPathToEndpoints(
        rawPoints,
        simplifyToleranceM(traverse.map_info),
        radius,
        waypoints[0],
        waypoints[waypoints.length - 1]
      )
    : null;
  const result: NewtonTraverseResult = {
    traverseId,
    status: traverse.status === "succeeded" && !usable ? "failed" : traverse.status,
    cancelRequested: traverse.cancel_requested === true,
    waypoints,
    params: problem ? paramsOf(problem) : {},
    requestHash: traverse.request_hash ?? null,
    path,
    segmentDistances: path ? pathSegmentDistances(path, radius) : null,
    rawVertexCount: traverse.status === "succeeded" ? rawPoints.length : null,
    mapInfo:
      traverse.map_info?.map(({ name, type, resolution }) => ({ name, type, resolution })) ?? null,
    runtimeMs: traverse.runtime ?? null,
    error:
      traverse.status === "succeeded" && !usable
        ? { code: "invalid_path", message: "Newton returned no usable path", details: [] }
        : (traverse.error ?? null),
  };
  if (raw) result.rawPath = rawPoints.length ? rawPoints : null;
  return result;
}

/** `GET /traverses/:id`. */
export async function getNewtonTraverseResult(
  traverseId: string,
  raw = false
): Promise<NewtonTraverseResultResponse> {
  const result = await newtonGetTraverse(traverseId);
  if (result.kind !== "ok") return failedEntry(result);
  return {
    status: "success",
    message: "Newton traverse",
    data: toNewtonTraverseResult(traverseId, result.data, raw),
  };
}

/**
 * `DELETE /traverses/:id`. A job that already finished (`409`) or that Newton no longer
 * knows (`404`) counts as cancelled.
 */
export async function cancelNewtonTraverse(
  traverseId: string
): Promise<NewtonEntryResponse<{ status: NewtonTraverseStatus | null }>> {
  const result = await newtonCancelTraverse(traverseId);
  if (result.kind === "ok") {
    return { status: "success", message: "Cancel requested", data: { status: result.data.status } };
  }
  if (result.kind === "rejected" && (result.status === 404 || result.status === 409)) {
    return { status: "success", message: "Nothing to cancel", data: { status: null } };
  }
  return failedEntry(result);
}
