export async function getMissions(missionId: number = null): Promise<WrappedResponse<Mission[]>> {
  let res;
  if (missionId) {
    res = await fetch(`/api/mission?missionId=${missionId}`);
  } else {
    res = await fetch(`/api/mission`);
  }
  const response: WrappedResponse<Mission[]> = await res.json();

  return response;
}

export async function upsertMission(missionObj: Mission): Promise<WrappedResponse<Mission[]>> {
  const res = await fetch(`/api/mission`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(missionObj),
  });
  const response: WrappedResponse<Mission[]> = await res.json();

  return response;
}

export async function deleteMission(missionId: number): Promise<WrappedResponse<any>> {
  const res = await fetch(`/api/mission?missionId=${missionId}`, {
    method: "DELETE",
  });
  const response: WrappedResponse<any> = await res.json();

  return response;
}
