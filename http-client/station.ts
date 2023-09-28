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

export async function upsertStation(
  stationObj: Station,
  log: boolean = false
): Promise<WrappedResponse<Station>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/station?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(stationObj),
  });
  const response: WrappedResponse<Station> = await res.json();
  return response;
}

export async function deleteStation(
  stationUUID: string,
  log: boolean = false
): Promise<WrappedResponse<number | null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(
    `/api/station?socketId=${socketId}&uuid=${stationUUID}&missionId=${missionId}${logStr}`,
    {
      method: "DELETE",
    }
  );
  const response: WrappedResponse<number | null> = await res.json();
  return response;
}
