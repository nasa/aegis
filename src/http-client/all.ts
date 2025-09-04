export async function getAll(
  missionId: number = null,
  loadTestOptions?: {
    // used for load testing ONLY
    serverURL?: string;
    cookies?: string;
  }
): Promise<WrappedResponse<OneMissionToRuleThemAll>> {
  const path = loadTestOptions?.serverURL
    ? `${loadTestOptions?.serverURL}/api/v1/all`
    : `/api/v1/all`;

  const headers: HeadersInit = {};
  if (loadTestOptions?.cookies) {
    headers["Cookie"] = loadTestOptions?.cookies;
  }

  let res: Response;
  if (missionId) {
    res = await fetch(`${path}?missionId=${missionId}`, { headers });
  } else {
    res = await fetch(`${path}`, { headers });
  }
  const response: WrappedResponse<OneMissionToRuleThemAll> = await res.json();
  return response;
}
