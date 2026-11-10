import { clientFetchWithTimeout } from "utils/fetch-with-timeout";

/** A batch can wait on several sequential Newton submits (~65 s timeout each). */
const NEWTON_BATCH_TIMEOUT_MS = 120_000;

/** Poll intervals while a row is unfinished: 2, 4, 8, then every 10 s. */
export const NEWTON_POLL_BACKOFF_MS = [2_000, 4_000, 8_000, 10_000] as const;

export const newtonPollDelayMs = (attempt: number): number =>
  NEWTON_POLL_BACKOFF_MS[Math.min(Math.max(0, attempt), NEWTON_POLL_BACKOFF_MS.length - 1)];

export const isNewtonTraverseFinished = (row: Pick<NewtonTraverseRow, "status">): boolean =>
  row.status === "succeeded" || row.status === "failed" || row.status === "cancelled";

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

/**
 * Requests (or reuses) Newton paths in one call; each result has its own error status.
 * Poll an unfinished row by sending the same request again.
 */
export async function postNewtonTraverses(
  missionId: number,
  traverses: NewtonTraversePostData[],
  loadTestOptions?: { serverURL?: string; cookies?: string }
): Promise<NewtonTraverseResponse[]> {
  const response = await clientFetchWithTimeout(
    `${loadTestOptions?.serverURL ?? ""}/api/v1/newton/traverses/batch?missionId=${missionId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(loadTestOptions?.cookies ? { Cookie: loadTestOptions.cookies } : {}),
      },
      body: JSON.stringify({ traverses } satisfies NewtonTraverseBatchPostData),
    },
    NEWTON_BATCH_TIMEOUT_MS
  );
  if (response.status !== 200) {
    const message = await errorMessage(response);
    return traverses.map(() => ({ status: "error", message, httpStatus: response.status }));
  }
  const body = (await response.json()) as WrappedResponse<NewtonTraverseResponse[]>;
  if (
    body.status !== "success" ||
    !Array.isArray(body.data) ||
    body.data.length !== traverses.length
  )
    throw new Error("Invalid Newton traverse batch response");
  return body.data;
}

/** Requests (or reuses) the Newton path through `waypoints`. */
export async function postNewtonTraverse({
  missionId,
  ...postData
}: NewtonTraversePostData & { missionId: number }): Promise<NewtonTraverseResponse> {
  const response = await clientFetchWithTimeout(
    `/api/v1/newton/traverses?missionId=${missionId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postData satisfies NewtonTraversePostData),
    },
    NEWTON_BATCH_TIMEOUT_MS
  );
  if (response.status !== 200) {
    return {
      status: "error",
      message: await errorMessage(response),
      httpStatus: response.status,
    };
  }
  return (await response.json()) as WrappedResponse<NewtonTraverseRow>;
}

export async function getNewtonHealth(): Promise<WrappedResponse<NewtonHealthReport>> {
  const response = await clientFetchWithTimeout("/api/v1/newton/health", undefined, 30_000);
  try {
    return (await response.json()) as WrappedResponse<NewtonHealthReport>;
  } catch {
    return { status: "error", message: `${response.status} ${response.statusText}` };
  }
}
