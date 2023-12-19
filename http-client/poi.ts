export async function getPOIs(mission: number): Promise<WrappedResponse<POI[]>> {
  const res = await fetch(`/api/poi?missionId=${mission}`);
  const response: WrappedResponse<POI[]> = await res.json();
  return response;
}

export async function upsertPOIs(
  pois: POI[],
  log: boolean = false
): Promise<WrappedResponse<POI[]>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/poi?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pois),
  });
  const response: WrappedResponse<POI[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving POIs to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deletePOIs(
  poiUuids: string[],
  log: boolean = false
): Promise<WrappedResponse<null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/poi?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(poiUuids),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting POIs from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
