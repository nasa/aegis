export async function getStations(missionId: number = null): Promise<WrappedResponse<Station[]>> {
  let res: Response;
  if (missionId) {
    res = await fetch(`/api/v1/station?missionId=${missionId}`);
  } else {
    res = await fetch(`/api/v1/station`);
  }
  const response: WrappedResponse<Station[]> = await res.json();
  return response;
}

export async function upsertStations(stations: Station[]): Promise<WrappedResponse<Station[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: StationUpsertRequest = { missionId, socketId, stations };
  const res = await fetch(`/api/v1/station`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<Station[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving stations to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteStations(stationUuids: string[]): Promise<WrappedResponse<null>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: StationDeleteRequest = { missionId, socketId, stationUuids };
  const res = await fetch(`/api/v1/station`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting stations from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
