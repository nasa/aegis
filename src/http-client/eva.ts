export async function getEvas(missionId: number = null): Promise<WrappedResponse<Eva[]>> {
  let res: Response;
  if (missionId) {
    res = await fetch(`/api/v1/eva?missionId=${missionId}`);
  } else {
    res = await fetch(`/api/v1/eva`);
  }
  const response: WrappedResponse<Eva[]> = await res.json();
  return response;
}

export async function upsertEvas(
  evas: Eva[],
  log: boolean = false
): Promise<WrappedResponse<Eva[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: EvaUpsertRequest = { socketId, missionId, log, evas };
  const res = await fetch(`/api/v1/eva`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<Eva[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving evas to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteEvas(
  evaUuids: string[],
  log: boolean = false
): Promise<WrappedResponse<null>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: EvaDeleteRequest = { socketId, missionId, log, evaUuids };
  const res = await fetch(`/api/v1/eva`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting evas from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
