import { clientFetchWithTimeout } from "utils/fetch-with-timeout";

/** Fetch a mission's pending profiles in one request; each result has its own error status. */
export async function getTerrainProfiles(
  missionId: number,
  profiles: TerrainProfilePostData[]
): Promise<TerrainProfileResponse[]> {
  const response = await clientFetchWithTimeout(
    `/api/v1/terrain-profile/batch?missionId=${missionId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profiles } satisfies TerrainProfileBatchPostData),
    },
    120_000
  );
  if (response.status !== 200) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      /* response body is not JSON */
    }
    return profiles.map(() => ({ status: "error", message, httpStatus: response.status }));
  }
  const body = (await response.json()) as WrappedResponse<TerrainProfileResponse[]>;
  if (
    body.status !== "success" ||
    !Array.isArray(body.data) ||
    body.data.length !== profiles.length
  )
    throw new Error("Invalid terrain profile batch response");
  return body.data;
}

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

export async function getTerrainProfile({
  missionId,
  path,
  pathSegmentDistances,
  entityKey,
  getElevationOnly = false,
  preview = false,
}: {
  missionId: number;
  path: AEGISPoint[];
  pathSegmentDistances: number[];
  entityKey?: string;
  getElevationOnly?: boolean;
  preview?: boolean;
}): Promise<TerrainProfileResponse> {
  const postData: TerrainProfilePostData = {
    path,
    pathSegmentDistances,
    entityKey,
    getElevationOnly,
    preview,
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
    return { status: "error", message: errorMessage, httpStatus: res.status };
  }

  return (await res.json()) as WrappedResponse<TerrainProfile>;
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
