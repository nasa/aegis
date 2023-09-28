export async function getPOIs(mission: number): Promise<WrappedResponse<POI[]>> {
  const res = await fetch(`/api/poi?missionId=${mission}`);
  const response: WrappedResponse<POI[]> = await res.json();
  return response;
}

export async function upsertPOI(poi: POI, log: boolean = false): Promise<WrappedResponse<POI>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/poi?socketId=${socketId}&missionId=${missionId}${logStr}`, {
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
  log: boolean = false
): Promise<WrappedResponse<null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(
    `/api/poi?socketId=${socketId}&uuid=${poiUuid}&missionId=${missionId}${logStr}`,
    {
      method: "DELETE",
    }
  );
  const response: WrappedResponse<null> = await res.json();
  return response;
}
