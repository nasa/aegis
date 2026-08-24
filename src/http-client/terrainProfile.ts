import { clientFetchWithTimeout } from "utils/fetch-with-timeout";

export async function getTerrainProfile({
  missionId,
  path,
  pathSegmentDistances,
  entityKey,
  getElevationOnly = false,
}: {
  missionId: number;
  path: AEGISPoint[];
  pathSegmentDistances: number[];
  entityKey?: string;
  getElevationOnly?: boolean;
}): Promise<WrappedResponse<TerrainProfile>> {
  const postData: TerrainProfilePostData = {
    path,
    pathSegmentDistances,
    entityKey,
    getElevationOnly,
  };
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

export async function getElevationProfile({
  missionId,
  path,
  pathSegmentDistances,
}: {
  missionId: number;
  path: AEGISPoint[];
  pathSegmentDistances: number[];
}): Promise<WrappedResponse<number[][]>> {
  const response = await getTerrainProfile({
    missionId,
    path,
    pathSegmentDistances,
    getElevationOnly: true,
  });
  return { ...response, data: response.data?.elevationsMeters };
}

export async function getElevationSinglePoint({
  missionId,
  point,
}: {
  missionId: number;
  point: AEGISPoint;
}): Promise<WrappedResponse<number>> {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return { status: "error", message: "Invalid point" };
  }

  const response = await getTerrainProfile({
    missionId,
    path: [point, point],
    pathSegmentDistances: [0],
    getElevationOnly: true,
  });
  return { ...response, data: response.data?.elevationsMeters[0]?.[0] };
}
