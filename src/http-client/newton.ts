import { clientFetchWithTimeout } from "utils/fetch-with-timeout";

/** A submit can wait on Newton's own timeout (~65 s). */
const NEWTON_ROUTE_TIMEOUT_MS = 90_000;

/** Poll intervals while a row is unfinished: 2, 4, 8, then every 10 s. */
export const NEWTON_POLL_BACKOFF_MS = [2_000, 4_000, 8_000, 10_000] as const;

export const newtonPollDelayMs = (attempt: number): number =>
  NEWTON_POLL_BACKOFF_MS[Math.min(Math.max(0, attempt), NEWTON_POLL_BACKOFF_MS.length - 1)];

export const isNewtonTraverseFinished = (row: Pick<NewtonTraverseRow, "status">): boolean =>
  row.status === "succeeded" || row.status === "failed" || row.status === "cancelled";

async function readWrapped<T>(response: globalThis.Response): Promise<WrappedResponse<T>> {
  try {
    return (await response.json()) as WrappedResponse<T>;
  } catch {
    return { status: "error", message: `${response.status} ${response.statusText}` };
  }
}

async function postJson<T>(url: string, body: unknown): Promise<WrappedResponse<T>> {
  const response = await clientFetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    NEWTON_ROUTE_TIMEOUT_MS
  );
  return readWrapped<T>(response);
}

/** Requests (or reuses) the Newton path through `waypoints`. */
export function postNewtonTraverse(
  data: NewtonTraversePostData
): Promise<WrappedResponse<NewtonTraverseRow>> {
  return postJson("/api/v1/newton/traverses", data);
}

/** One call for many requests; each entry succeeds or fails on its own. */
export function postNewtonTraverseBatch(
  data: NewtonTraverseBatchPostData
): Promise<WrappedResponse<NewtonTraverseBatchResult[]>> {
  return postJson("/api/v1/newton/traverses/batch", data);
}

export async function getNewtonTraverse(
  uuid: string,
  { raw = false } = {}
): Promise<WrappedResponse<NewtonTraverseRow>> {
  const response = await clientFetchWithTimeout(
    `/api/v1/newton/traverses/${encodeURIComponent(uuid)}${raw ? "?raw=1" : ""}`,
    undefined,
    NEWTON_ROUTE_TIMEOUT_MS
  );
  return readWrapped(response);
}

export async function getNewtonHealth(): Promise<WrappedResponse<NewtonHealthReport>> {
  const response = await clientFetchWithTimeout("/api/v1/newton/health", undefined, 30_000);
  return readWrapped(response);
}
