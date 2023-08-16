export async function getMissions(missionId: number = null): Promise<WrappedResponse<Mission[]>> {
  let res: Response;
  if (missionId) {
    res = await fetch(`/api/mission?missionId=${missionId}`);
  } else {
    res = await fetch(`/api/mission`);
  }
  const response: WrappedResponse<Mission[]> = await res.json();
  return response;
}

export async function upsertMission(
  missionObj: Mission,
  socketId: string
): Promise<WrappedResponse<Mission>> {
  const res = await fetch(`/api/mission?socketId=${socketId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(missionObj),
  });
  const response: WrappedResponse<Mission> = await res.json();
  return response;
}

export async function deleteMission(missionId: number): Promise<WrappedResponse<number | null>> {
  const res = await fetch(`/api/mission?missionId=${missionId}`, {
    method: "DELETE",
  });
  const response: WrappedResponse<number | null> = await res.json();
  return response;
}
