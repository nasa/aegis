export async function getElevationProfile(
  missionId: number,
  demFilepath: string,
  path: AEGISPoint[],
  pathSegmentDistances: number[],
  resolutionMeters: number,
  R: number
): Promise<WrappedResponse<number[][]>> {
  const postData: ElevationProfilePostData = {
    missionId,
    demFilepath,
    path,
    pathSegmentDistances,
    resolutionMeters,
    R,
  };

  const res = await fetch(`/api/elevation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(postData),
  });

  const response: WrappedResponse<number[][]> = await res.json();
  return response;
}
