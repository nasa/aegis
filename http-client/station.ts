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
  socketId: string
): Promise<WrappedResponse<Station>> {
  const res = await fetch(`/api/station?socketId=${socketId}`, {
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
  missionId: number,
  socketId: string
): Promise<WrappedResponse<number | null>> {
  const res = await fetch(
    `/api/station?socketId=${socketId}&uuid=${stationUUID}&missionId=${missionId}`,
    {
      method: "DELETE",
    }
  );
  const response: WrappedResponse<number | null> = await res.json();
  return response;
}
