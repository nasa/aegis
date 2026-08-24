import { clientFetchWithTimeout } from "utils/fetch-with-timeout";

export async function getTerrainProfile(
  missionId: number,
  path: AEGISPoint[],
  pathSegmentDistances: number[],
  entityKey?: string
): Promise<WrappedResponse<TerrainProfile>> {
  const postData: TerrainProfilePostData = { path, pathSegmentDistances, entityKey };
  const res = await clientFetchWithTimeout(`/api/v1/terrain-profile?missionId=${missionId}`, {
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

  return (await res.json()) as WrappedResponse<TerrainProfile>;
}

export async function getElevationProfile(
  missionId: number,
  _demFilepath: string,
  path: AEGISPoint[],
  pathSegmentDistances: number[],
  _resolutionMeters: number,
  _radius: number
): Promise<WrappedResponse<number[][]>> {
  const response = await getTerrainProfile(missionId, path, pathSegmentDistances);
  return { ...response, data: response.data?.elevationsMeters };
}

export async function getElevationSinglePoint(
  missionId: number,
  _demFilepath: string,
  point: AEGISPoint,
  _radius: number
): Promise<WrappedResponse<number>> {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return { status: "error", message: "Invalid point" };
  }

  const response = await getTerrainProfile(missionId, [point, point], [0]);
  return { ...response, data: response.data?.elevationsMeters[0]?.[0] };
}
