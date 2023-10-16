export async function getStations(missionId: number = null): Promise<WrappedResponse<Station[]>> {
  let res: Response;
  if (missionId) {
    res = await fetch(`/api/station?missionId=${missionId}`);
  } else {
    res = await fetch(`/api/station`);
  }
  const response: WrappedResponse<Station[]> = await res.json();
  return response;
}

export async function upsertStations(
  stationObjs: Station[],
  log: boolean = false
): Promise<WrappedResponse<Station[]>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/station?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(stationObjs),
  });
  const response: WrappedResponse<Station[]> = await res.json();
  return response;
}

export async function deleteStations(
  stationUUIDs: string[],
  log: boolean = false
): Promise<WrappedResponse<null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/station?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(stationUUIDs),
  });
  const response: WrappedResponse<null> = await res.json();
  return response;
}
