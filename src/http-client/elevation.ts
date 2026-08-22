import { clientFetchWithTimeout } from "utils/fetch-with-timeout";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

export class ElevationClientError extends Error {
  constructor(
    readonly code: ElevationErrorCode | undefined,
    message: string,
    readonly httpStatus: number,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "ElevationClientError";
  }
}

type ElevationRequestOptions = {
  signal?: AbortSignal;
  streamId?: string;
  generation?: number;
};

export async function getElevationProfile(
  missionId: number,
  demFilepath: string,
  path: AEGISPoint[],
  pathSegmentDistances: number[],
  resolutionMeters: number,
  radius: number,
  options: ElevationRequestOptions = {}
): Promise<WrappedResponse<number[][]>> {
  const postData: ElevationProfilePostData = {
    missionId,
    demFilepath,
    path,
    pathSegmentDistances,
    resolutionMeters,
    radius,
    streamId: options.streamId,
    generation: options.generation,
  };

  const res = await clientFetchWithTimeout(`/api/v1/elevation?missionId=${missionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(postData),
    signal: options.signal,
  });

  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    let errorBody: WrappedResponse<never> | undefined;
    try {
      errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    throw new ElevationClientError(
      errorBody?.code,
      errorMessage,
      res.status,
      errorBody?.retryAfterMs
    );
  }
  const response: WrappedResponse<number[][]> = await res.json();
  return response;
}

export async function getElevationSinglePoint(
  missionId: number,
  demFilepath: string,
  point: AEGISPoint,
  radius: number,
  options: ElevationRequestOptions = {}
): Promise<WrappedResponse<number>> {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return { status: "error", message: "Invalid point" };
  }
  const fakePoint = { lat: point.lat + 0.001, lng: point.lng };
  const dist = getDistanceBetweenTwoCoordinates(point, fakePoint, radius);
  const postData: ElevationProfilePostData = {
    missionId,
    demFilepath,
    path: [point, fakePoint],
    pathSegmentDistances: [dist],
    resolutionMeters: 10,
    radius,
  };

  const res = await clientFetchWithTimeout(`/api/v1/elevation?missionId=${missionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(postData),
    signal: options.signal,
  });

  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    let errorBody: WrappedResponse<never> | undefined;
    try {
      errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    throw new ElevationClientError(
      errorBody?.code,
      errorMessage,
      res.status,
      errorBody?.retryAfterMs
    );
  }
  const response: WrappedResponse<number[][]> = await res.json();
  const convertedResponse = { ...response, data: response.data ? response.data[0][0] : undefined };
  return convertedResponse;
}
