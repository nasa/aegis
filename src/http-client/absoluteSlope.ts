import { clientFetchWithTimeout } from "utils/fetch-with-timeout";

export async function getAbsoluteSlopeProfile(
  missionId: number,
  path: AEGISPoint[],
  pathSegmentDistances: number[]
): Promise<WrappedResponse<(number | null)[][]>> {
  const postData: AbsoluteSlopeProfilePostData = { path, pathSegmentDistances };
  const res = await clientFetchWithTimeout(`/api/v1/absolute-slope?missionId=${missionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postData),
  });

  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    return { status: "error", message: errorMessage };
  }
  return res.json();
}
