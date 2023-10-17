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

export async function upsertEvas(
  evas: Eva[],
  log: boolean = false
): Promise<WrappedResponse<Eva[]>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/eva?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(evas),
  });

  const response: WrappedResponse<Eva[]> = await res.json();
  return response;
}

export async function deleteEvas(
  evaUuids: string[],
  log: boolean = false
): Promise<WrappedResponse<null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/eva?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(evaUuids),
  });
  const response: WrappedResponse<null> = await res.json();
  return response;
}
