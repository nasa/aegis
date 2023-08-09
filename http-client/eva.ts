export async function getEvas(missionId: number = null): Promise<WrappedResponse<Eva[]>> {
  let res: Response;
  if (missionId) {
    res = await fetch(`/api/eva?missionId=${missionId}`);
  } else {
    res = await fetch(`/api/eva`);
  }
  const response: WrappedResponse<Eva[]> = await res.json();
  return response;
}

export async function upsertEva(
  evaObj: Eva,
  uniqueClientId: string
): Promise<WrappedResponse<Eva>> {
  const res = await fetch(`/api/eva?uniqueClientId=${uniqueClientId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(evaObj),
  });
  const response: WrappedResponse<Eva> = await res.json();
  return response;
}

export async function deleteEva(
  evaUuid: string,
  missionId: number,
  uniqueClientId: string
): Promise<WrappedResponse<number | null>> {
  const res = await fetch(
    `/api/eva?uniqueClientId=${uniqueClientId}&uuid=${evaUuid}&missionId=${missionId}`,
    {
      method: "DELETE",
    }
  );
  const response: WrappedResponse<number | null> = await res.json();
  return response;
}
