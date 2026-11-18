import { clientFetchWithTimeout } from "utils/fetch-with-timeout";

/** A batch can wait on several Newton calls (~65 s timeout each), four at a time. */
const NEWTON_BATCH_TIMEOUT_MS = 120_000;

/** Poll intervals while a job is unfinished: 2, 4, 8, then every 10 s. */
export const NEWTON_POLL_BACKOFF_MS = [2_000, 4_000, 8_000, 10_000] as const;

export const newtonPollDelayMs = (attempt: number): number =>
  NEWTON_POLL_BACKOFF_MS[Math.min(Math.max(0, attempt), NEWTON_POLL_BACKOFF_MS.length - 1)];

export const isNewtonTraverseFinished = (result: Pick<NewtonTraverseResult, "status">): boolean =>
  result.status === "succeeded" || result.status === "failed" || result.status === "cancelled";

type LoadTestOptions = { serverURL?: string; cookies?: string };

async function errorMessage(response: globalThis.Response): Promise<string> {
  let message = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    if (body?.message) message = body.message;
  } catch {
    /* response body is not JSON */
  }
  return message;
}

/** Calls a batch route and returns one entry per item, in order. */
async function batch<T>(
  url: string,
  init: RequestInit,
  count: number
): Promise<NewtonEntryResponse<T>[]> {
  const response = await clientFetchWithTimeout(url, init, NEWTON_BATCH_TIMEOUT_MS);
  if (response.status !== 200) {
    const message = await errorMessage(response);
    return Array.from({ length: count }, () => ({
      status: "error" as const,
      message,
      httpStatus: response.status,
    }));
  }
  const body = (await response.json()) as WrappedResponse<NewtonEntryResponse<T>[]>;
  if (body.status !== "success" || !Array.isArray(body.data) || body.data.length !== count)
    throw new Error("Invalid Newton traverse batch response");
  return body.data;
}

const cookieHeader = (options?: LoadTestOptions): Record<string, string> =>
  options?.cookies ? { Cookie: options.cookies } : {};

/**
 * Submits each request to Newton. Keep each entry's `traverseId` and poll it with
 * `getNewtonTraverses`; a repeated request comes back at once as `cached`.
 */
export function postNewtonTraverses(
  missionId: number,
  traverses: NewtonTraversePostData[],
  loadTestOptions?: LoadTestOptions
): Promise<NewtonTraverseSubmitResponse[]> {
  return batch(
    `${loadTestOptions?.serverURL ?? ""}/api/v1/newton/traverses?missionId=${missionId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(loadTestOptions) },
      body: JSON.stringify({ traverses } satisfies NewtonTraverseBatchPostData),
    },
    traverses.length
  );
}

/** Newton's jobs by id. An entry with `httpStatus: 404` means the job is gone: post again. */
export function getNewtonTraverses(
  missionId: number,
  traverseIds: string[],
  { raw = false, ...loadTestOptions }: LoadTestOptions & { raw?: boolean } = {}
): Promise<NewtonTraverseResultResponse[]> {
  const query = new URLSearchParams({ missionId: String(missionId), ids: traverseIds.join(",") });
  if (raw) query.set("raw", "1");
  return batch(
    `${loadTestOptions.serverURL ?? ""}/api/v1/newton/traverses?${query.toString()}`,
    { method: "GET", headers: cookieHeader(loadTestOptions) },
    traverseIds.length
  );
}

/**
 * Cancels a Newton job. Only cancel ids whose submission was `reuse: "new"`; the others are
 * shared with other callers. A job that already finished counts as cancelled.
 */
export async function deleteNewtonTraverse(
  missionId: number,
  traverseId: string
): Promise<NewtonEntryResponse<{ status: NewtonTraverseStatus | null }>> {
  const response = await clientFetchWithTimeout(
    `/api/v1/newton/traverses/${encodeURIComponent(traverseId)}?missionId=${missionId}`,
    { method: "DELETE" },
    NEWTON_BATCH_TIMEOUT_MS
  );
  if (response.status !== 200) {
    return {
      status: "error",
      message: await errorMessage(response),
      httpStatus: response.status,
    };
  }
  return (await response.json()) as NewtonEntryResponse<{ status: NewtonTraverseStatus | null }>;
}

export async function getNewtonHealth(): Promise<WrappedResponse<NewtonHealthReport>> {
  const response = await clientFetchWithTimeout("/api/v1/newton/health", undefined, 30_000);
  try {
    return (await response.json()) as WrappedResponse<NewtonHealthReport>;
  } catch {
    return { status: "error", message: `${response.status} ${response.statusText}` };
  }
}
