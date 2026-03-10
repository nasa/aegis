export async function getAll(
  missionId: number | null = null,
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
  const response: WrappedResponse<OneMissionToRuleThemAll> = await res.json();
  return response;
}
