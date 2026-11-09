/**
 * Server-side client for the Newton traverse-planning REST API.
 *
 * Every call resolves to a `NewtonResult` and never throws. Callers decide what to
 * retry: `rejected` is final, `transient` may succeed later.
 */
import { serverLogger } from "utils/logging/serverLogger";

export const NEWTON_DEFAULT_TIMEOUT_MS = 65_000;

const MESSAGE_SNIPPET_LENGTH = 200;

/** Newton refused the request; retrying the same request won't help. */
const REJECTED_STATUSES = new Set([400, 404, 409, 413, 422]);

const WORK_STATUSES: readonly Newton.WorkStatus[] = [
  "pending",
  "in_progress",
  "succeeded",
  "failed",
  "cancelled",
];

type BodyCheck<T> = (body: unknown) => body is T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isWorkStatus = (value: unknown): value is Newton.WorkStatus =>
  typeof value === "string" && (WORK_STATUSES as readonly string[]).includes(value);

const isHealth: BodyCheck<Newton.Health> = (body): body is Newton.Health =>
  isRecord(body) && typeof body.status === "string";

const isMapsResponse: BodyCheck<Newton.MapsResponse> = (body): body is Newton.MapsResponse =>
  isRecord(body) && Array.isArray(body.maps);

const isPostTraverseResponse: BodyCheck<Newton.PostTraverseResponse> = (
  body
): body is Newton.PostTraverseResponse => isRecord(body) && typeof body.traverse_id === "string";

const isTraverse: BodyCheck<Newton.Traverse> = (body): body is Newton.Traverse =>
  isRecord(body) && isWorkStatus(body.status);

const isCancelResponse: BodyCheck<Newton.CancelTraverseResponse> = (
  body
): body is Newton.CancelTraverseResponse => isRecord(body) && isWorkStatus(body.status);

/** Reads the configured client options from the environment. */
export function newtonOptionsFromEnv(): NewtonClientOptions {
  const timeout = Number(process.env.NEWTON_TIMEOUT_MS);
  return {
    baseUrl: process.env.NEWTON_BASE_URL,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : NEWTON_DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Parses an error body. Accepts the error model (`{"error": {code, message, details}}`)
 * and the legacy `{"error": "<message>"}` form, which becomes `internal_error`.
 */
export function parseNewtonError(body: unknown): Newton.Error | null {
  if (!isRecord(body)) return null;
  const error = body.error;
  if (typeof error === "string") return { code: "internal_error", message: error, details: [] };
  if (!isRecord(error) || typeof error.code !== "string") return null;
  return {
    code: error.code,
    message: typeof error.message === "string" ? error.message : "",
    details: Array.isArray(error.details) ? error.details.filter(isRecord) : [],
  };
}

const snippet = (text: string): string =>
  text.replace(/\s+/g, " ").trim().slice(0, MESSAGE_SNIPPET_LENGTH);

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function logResult(method: string, path: string, result: NewtonResult<unknown>): void {
  if (result.kind === "ok") return;
  if (result.kind === "rejected") {
    serverLogger.info({
      logId: "newton-v1:logResult:rejected",
      logValue: `${method} ${path} rejected (${result.status} ${result.error.code}): ${result.error.message}`,
    });
    return;
  }
  if (result.reason === "disabled") return;
  serverLogger.warning({
    logId: "newton-v1:logResult:transient",
    logValue: `${method} ${path} transient (${result.reason}${result.status ? ` ${result.status}` : ""}): ${result.message}`,
  });
}

/** Turns an HTTP response into a result. Exported for tests. */
export function classifyResponse<T>(
  status: number,
  text: string,
  isExpected: BodyCheck<T>
): NewtonResult<T> {
  let body: unknown;
  let isJson = true;
  try {
    body = JSON.parse(text);
  } catch {
    isJson = false;
  }

  if (status >= 200 && status < 300) {
    if (!isJson) return { kind: "transient", status, reason: "non_json", message: snippet(text) };
    if (!isExpected(body)) {
      return { kind: "transient", status, reason: "unexpected_body", message: snippet(text) };
    }
    return { kind: "ok", status, data: body };
  }

  const error = isJson ? parseNewtonError(body) : null;
  if (REJECTED_STATUSES.has(status) && error) return { kind: "rejected", status, error };
  if (!isJson) return { kind: "transient", status, reason: "non_json", message: snippet(text) };
  return {
    kind: "transient",
    status,
    reason: "http",
    message: error?.message || snippet(text),
    ...(error ? { error } : {}),
  };
}

async function request<T>(
  options: NewtonClientOptions,
  method: "GET" | "POST" | "DELETE",
  path: string,
  isExpected: BodyCheck<T>,
  body?: unknown
): Promise<NewtonResult<T>> {
  if (!options.baseUrl) {
    return {
      kind: "transient",
      status: null,
      reason: "disabled",
      message: "NEWTON_BASE_URL is not set",
    };
  }
  const doFetch = options.fetch ?? fetch;
  let result: NewtonResult<T>;
  try {
    const res = await doFetch(joinUrl(options.baseUrl, path), {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    result = classifyResponse(res.status, await res.text(), isExpected);
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    result = {
      kind: "transient",
      status: null,
      reason: isTimeout ? "timeout" : "network",
      message: isTimeout
        ? `no response within ${options.timeoutMs} ms`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  }
  logResult(method, path, result);
  return result;
}

const traversePath = (traverseId: string): string => `/traverses/${encodeURIComponent(traverseId)}`;

/** `GET /health`. */
export function newtonHealth(
  options: NewtonClientOptions = newtonOptionsFromEnv()
): Promise<NewtonResult<Newton.Health>> {
  return request(options, "GET", "/health", isHealth);
}

/** `GET /traverses/maps`. Newton doesn't paginate yet, so `next_cursor` is returned as is. */
export function newtonListMaps(
  query: { planet?: Newton.Planet; type?: Newton.MapType } = {},
  options: NewtonClientOptions = newtonOptionsFromEnv()
): Promise<NewtonResult<Newton.MapsResponse>> {
  const params = new URLSearchParams();
  if (query.planet) params.set("planet", query.planet);
  if (query.type) params.set("type", query.type);
  const qs = params.toString();
  return request(options, "GET", `/traverses/maps${qs ? `?${qs}` : ""}`, isMapsResponse);
}

/** `GET /traverses/maps/probe` for a point: the maps that cover it. */
export function newtonProbePoint(
  query: { planet: Newton.Planet; lon: number; lat: number },
  options: NewtonClientOptions = newtonOptionsFromEnv()
): Promise<NewtonResult<Newton.MapsResponse>> {
  const params = new URLSearchParams({
    planet: query.planet,
    lon: String(query.lon),
    lat: String(query.lat),
  });
  return request(options, "GET", `/traverses/maps/probe?${params.toString()}`, isMapsResponse);
}

/** `POST /traverses`. Build `problem` with `buildTraverseProblem`. */
export async function newtonPostTraverse(
  problem: Newton.TraverseProblem,
  options: NewtonClientOptions = newtonOptionsFromEnv()
): Promise<NewtonResult<NewtonPostedTraverse>> {
  const result = await request(options, "POST", "/traverses", isPostTraverseResponse, problem);
  if (result.kind !== "ok") return result;
  const { data } = result;
  const reuse: NewtonTraverseReuse = data.cached
    ? "cached"
    : data.deduplicated
      ? "deduplicated"
      : "new";
  return {
    kind: "ok",
    status: result.status,
    data: {
      traverseId: data.traverse_id,
      requestHash: typeof data.request_hash === "string" ? data.request_hash : null,
      reuse,
    },
  };
}

/** `GET /traverses/:id`. */
export function newtonGetTraverse(
  traverseId: string,
  options: NewtonClientOptions = newtonOptionsFromEnv()
): Promise<NewtonResult<Newton.Traverse>> {
  return request(options, "GET", traversePath(traverseId), isTraverse);
}

/**
 * `DELETE /traverses/:id`. A running job reports `in_progress` until it stops, so poll
 * `newtonGetTraverse` for the final state. Never cancel a job that came back
 * `deduplicated` or `cached`: it's shared with other callers.
 */
export function newtonCancelTraverse(
  traverseId: string,
  options: NewtonClientOptions = newtonOptionsFromEnv()
): Promise<NewtonResult<Newton.CancelTraverseResponse>> {
  return request(options, "DELETE", traversePath(traverseId), isCancelResponse);
}
