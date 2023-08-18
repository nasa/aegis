export async function getPOIs(mission: number): Promise<WrappedResponse<POI[]>> {
  const res = await fetch(`/api/poi?missionId=${mission}`);
  const response: WrappedResponse<POI[]> = await res.json();
  return response;
}

export async function upsertPOI(poi: POI): Promise<WrappedResponse<POI>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const res = await fetch(`/api/poi?socketId=${socketId}&missionId=${missionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(poi),
  });
  const response: WrappedResponse<POI> = await res.json();
  return response;
}

export async function deletePOI(poiUuid: string): Promise<WrappedResponse<null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const res = await fetch(`/api/poi?socketId=${socketId}&uuid=${poiUuid}&missionId=${missionId}`, {
    method: "DELETE",
  });
  const response: WrappedResponse<null> = await res.json();
  return response;
}
