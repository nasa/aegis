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

export async function upsertMissions(
  missionObjs: Mission[],
  log: boolean = false
): Promise<WrappedResponse<Mission[]>> {
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/mission?socketId=${socketId}${logStr}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(missionObjs),
  });
  const response: WrappedResponse<Mission[]> = await res.json();
  return response;
}

export async function deleteMissions(
  missionIds: number[],
  log: boolean = false
): Promise<WrappedResponse<null>> {
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/mission?${logStr}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(missionIds.map(String)),
  });
  const response: WrappedResponse<null> = await res.json();
  return response;
}
