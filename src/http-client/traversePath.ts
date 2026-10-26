import { clientFetchWithTimeout } from "utils/fetch-with-timeout";

/** `GET /api/v1/traversePath` — rows for the given traverse refUuids. */
export async function getTraversePathRows({
  missionId,
  refUuids,
}: {
  missionId: number;
  refUuids: string[];
}): Promise<WrappedResponse<TraversePathRow[]>> {
  const params = new URLSearchParams({
    missionId: String(missionId),
    traverseRefUuids: refUuids.join(","),
  });
  let res: Response;
  try {
    res = await clientFetchWithTimeout(`/api/v1/traversePath?${params.toString()}`);
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }

  if (res.status !== 200) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* response body is not JSON */
    }
    return { status: "error", message };
  }

  return (await res.json()) as WrappedResponse<TraversePathRow[]>;
}
