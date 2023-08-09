export async function getPOIs(mission: number): Promise<WrappedResponse<POI[]>> {
  const res = await fetch(`/api/poi?missionId=${mission}`);
  const response: WrappedResponse<POI[]> = await res.json();
  return response;
}

export async function upsertPOI(poi: POI, uniqueClientId: string): Promise<WrappedResponse<POI>> {
  const res = await fetch(`/api/poi?uniqueClientId=${uniqueClientId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(poi),
  });
  const response: WrappedResponse<POI> = await res.json();
  return response;
}

export async function deletePOI(
  poiUuid: string,
  missionId: number,
  uniqueClientId: string
): Promise<WrappedResponse<null>> {
  const res = await fetch(
    `/api/poi?uniqueClientId=${uniqueClientId}&uuid=${poiUuid}&missionId=${missionId}`,
    {
      method: "DELETE",
    }
  );
  const response: WrappedResponse<null> = await res.json();
  return response;
}
