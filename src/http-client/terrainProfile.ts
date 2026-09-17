import { clientFetchWithTimeout } from "utils/fetch-with-timeout";

/** Validate that all derived arrays describe the same path revision. */
export function normalizeTerrainProfile(
  profile: TerrainProfile | undefined,
  path: AEGISPoint[],
  pathSegmentDistances: number[]
): TerrainProfile | null {
  const segmentCount = path.length - 1;
  if (
    !profile ||
    pathSegmentDistances.length !== segmentCount ||
    profile.elevationsMeters.length !== segmentCount ||
    profile.terrainSlopesDegrees.length !== segmentCount
  ) {
    return null;
  }

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
    const elevations = profile.elevationsMeters[segmentIndex];
    const slopes = profile.terrainSlopesDegrees[segmentIndex];
    if (
      !Array.isArray(elevations) ||
      !Array.isArray(slopes) ||
      elevations.length < 2 ||
      elevations.length !== slopes.length ||
      !elevations.every((value) => typeof value === "number" && Number.isFinite(value)) ||
      !slopes.every(
        (value) => value === null || (typeof value === "number" && Number.isFinite(value))
      )
    ) {
      return null;
    }
  }

  return profile;
}

async function requestTerrainProfile({
  missionId,
  path,
  pathSegmentDistances,
  entityKey,
  getElevationOnly,
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

export async function getTerrainProfile({
  missionId,
  path,
  pathSegmentDistances,
  entityKey,
}: {
  missionId: number;
  path: AEGISPoint[];
  pathSegmentDistances: number[];
  entityKey?: string;
}): Promise<WrappedResponse<TerrainProfile>> {
  return requestTerrainProfile({ missionId, path, pathSegmentDistances, entityKey });
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

  const response = await requestTerrainProfile({
    missionId,
    path: [point, point],
    pathSegmentDistances: [0],
    getElevationOnly: true,
  });
  return { ...response, data: response.data?.elevationsMeters[0]?.[0] };
}
