export async function getMissions(missionId: number = null): Promise<WrappedResponse<Mission[]>> {
  let res: Response;
  if (missionId) {
    res = await fetch(`/api/v1/mission?missionId=${missionId}`);
  } else {
    res = await fetch(`/api/v1/mission`);
  }
  const response: WrappedResponse<Mission[]> = await res.json();
  return response;
}

export async function getMissionHomepageItems(): Promise<WrappedResponse<MissionHomepageItem[]>> {
  const res = await fetch(`/api/v1/missionHomepageItems`);
  const response: WrappedResponse<MissionHomepageItem[]> = await res.json();
  return response;
}

export async function upsertMissions(
  missions: Mission[],
  log: boolean = false
): Promise<WrappedResponse<Mission[]>> {
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: MissionUpsertRequest = { socketId, log, missions };
  const res = await fetch(`/api/v1/mission`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<Mission[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving missions to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteMissions(
  missionIds: number[],
  log: boolean = false
): Promise<WrappedResponse<null>> {
  const requestBody: MissionDeleteRequest = { missionIds, log };
  const res = await fetch(`/api/v1/mission`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting missions from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
