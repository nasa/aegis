export async function getAutomergeDocListing(
  missionId: number | null = null,
  loadTestOptions?: {
    // used for load testing ONLY
    serverURL?: string;
    cookies?: string;
  }
): Promise<WrappedResponse<AutomergeDocListing[]>> {
  const path = loadTestOptions?.serverURL
    ? `${loadTestOptions?.serverURL}/api/v1/docListing`
    : `/api/v1/docListing`;

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

  const response: WrappedResponse<AutomergeDocListing[]> = await res.json();
  return response;
}
