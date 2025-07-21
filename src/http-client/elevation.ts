import { clientFetchWithTimeout } from "utils/fetch-with-timeout";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

export async function getElevationProfile(
  missionId: number,
  demFilepath: string,
  path: AEGISPoint[],
  pathSegmentDistances: number[],
  resolutionMeters: number,
  radius: number
): Promise<WrappedResponse<number[][]>> {
  const postData: ElevationProfilePostData = {
    missionId,
    demFilepath,
    path,
    pathSegmentDistances,
    resolutionMeters,
    radius,
  };

  const res = await clientFetchWithTimeout(`/api/v1/elevation?missionId=${missionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(postData),
  });

  const response: WrappedResponse<number[][]> = await res.json();
  return response;
}

export async function getElevationSinglePoint(
  missionId: number,
  demFilepath: string,
  point: AEGISPoint,
  radius: number
): Promise<WrappedResponse<number>> {
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
  });

  const response: WrappedResponse<number[][]> = await res.json();
  const data = response.data ? response.data[0][0] : null;
  const convertedResponse = { ...response, data };
  return convertedResponse;
}
