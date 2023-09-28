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

export async function getMissionHomepageItems(): Promise<WrappedResponse<MissionHomepageItem[]>> {
  const res = await fetch(`/api/missionHomepageItems`);
  const response: WrappedResponse<MissionHomepageItem[]> = await res.json();
  return response;
}

export async function upsertMission(
  missionObj: Mission,
  log: boolean = false
): Promise<WrappedResponse<Mission>> {
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/mission?missionId=${missionObj.id}&socketId=${socketId}${logStr}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(missionObj),
  });
  const response: WrappedResponse<Mission> = await res.json();
  return response;
}

export async function deleteMission(
  missionId: number,
  log: boolean = false
): Promise<WrappedResponse<number | null>> {
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/mission?missionId=${missionId}${logStr}`, {
    method: "DELETE",
  });
  const response: WrappedResponse<number | null> = await res.json();
  return response;
}
