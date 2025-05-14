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

export async function upsertMissions(missions: Mission[]): Promise<WrappedResponse<Mission[]>> {
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: MissionUpsertRequest = { socketId, missions };
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

export async function deleteMissions(missionIds: number[]): Promise<WrappedResponse<null>> {
  const requestBody: MissionDeleteRequest = { missionIds };
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

export async function duplicateMission(missionId: number): Promise<WrappedResponse<number>> {
  const res = await fetch(`/api/v1/missionDup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ missionId }),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error duplicating mission. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

// using any here because the response is database records that haven't gone through transformation to the AEGIS store types.
// Given that this is a raw dump, we want the raw data and don't need to be worried about whether it matches any specific type.
export async function dumpMission(missionId: number): Promise<WrappedResponse<MissionDump>> {
  const res = await fetch(`/api/v1/missionDump?missionId=${missionId}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: WrappedResponse<any> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error dumping mission. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
